/*
	Translation library
*/
(function(root){

	// Get the URL query string and parse it
	function getQuery() {
		var r = {length:0};
		var q = location.search;
		if(q && q != '#'){
			// remove the leading ? and trailing &
			q = q.replace(/^\?/,'').replace(/\&$/,'');
			q.split('&').forEach(function(element){
				var key = element.split('=')[0];
				var val = element.split('=')[1];
				if(/^[0-9.]+$/.test(val)) val = parseFloat(val);	// convert floats
				r[key] = val;
				r['length']++;
			});
		}
		return r;
	};

	function Translator(inp){

		this.q = getQuery();
		this.id = (inp && typeof inp.id==="string") ? inp.id : 'form';
		this.langfile = (inp && typeof inp.languages==="string") ? inp.languages : '';
		this.formfile = (inp && typeof inp.help==="string") ? inp.help : '';
		this.langs = (inp && typeof inp.langs==="object") ? inp.langs : { 'en': {'name':'English'} };
		// Set empty help and phrasebook
		this.form = undefined;
		this.phrasebook = undefined;
		this.logging = true;

		this.loadLanguages();
		this.loadHelp();
		
		return this;
	};
	
	Translator.prototype.loadHelp = function(){
		this.log('loadHelp',this.formfile);
		S(document).ajax(this.formfile,{
			'dataType': 'json',
			'this': this,
			'success': function(d,attr){
				this.form = d;
				this.init();
			},
			'error': function(err,attr){
				this.log('ERROR','Unable to load '+attr.url,err)
			}		
		});
		return this;
	};

	Translator.prototype.loadLanguages = function(){
		this.log('loadLanguages',this.langfile);
		S(document).ajax(this.langfile,{
			'dataType': 'json',
			'this': this,
			'success': function(d,attr){
				this.langs = d;
				for(var l in this.langs){
					if(this.langs[l]['default']) this.langdefault = l;
				}
				this.init();
			},
			'error': function(err,attr){
				this.log('ERROR','Unable to load '+attr.url,err)
			}
		});

		return this;
	};

	Translator.prototype.init = function(){
		this.log('init');
		if(!this.langdefault){
			this.log('ERROR','No default language set. Please make sure '+this.langfile+' has a default language set. Just add a %c"default": true%c','font-weight: bold;color:#0DBC37');
			return this;
		}
		
		// We need both input files (languages and the form) to continue
		if(!this.form || !this.langs) return this;
		
		// Load the master language config file
		this.setLanguage();

		this.lang = this.q.lang;
		if(!this.lang) this.lang = "en";
		
		this.page = S('#'+this.id);

		if(!this.langs[this.lang]){
			this.log('ERROR','The language '+this.lang+' does not appear to exist in the translation file.');
			this.page.html('The language '+this.lang+' does not appear to exist yet.');
			return this;
		}

		html = "<form id=\"langchoice\"><label>Select language (not all are complete):</label><select name=\"lang\">"
		for(var l in this.langs) html += '<option name="'+l+'" value="'+l+'"'+(this.lang==l ? " selected" : "")+'>'+this.langs[l].name+'</option>';
		html += "</select></form>";


		if(S('#translate_chooser').length == 0) this.page.prepend('<div id="translate_chooser"></div>');
		if(S('#translation').length == 0) this.page.append('<div id="translation"></div>')
		S('#translate_chooser').html(html).find('#langchoice select').on('change',{me:this},function(e){ e.data.me.setLanguage(e.currentTarget.value); });

		this.setLanguage(this.lang);

		return this;
	}

	Translator.prototype.log = function(){
		if(this.logging || arguments[0]=="ERROR"){
			var args = Array.prototype.slice.call(arguments, 0);
			if(console && typeof console.log==="function"){
				if(arguments[0] == "ERROR") console.log('%cERROR%c %cTranslator%c: '+args[1],'color:white;background-color:#D60303;padding:2px;','','font-weight:bold;','',(args.length > 2 ? args.splice(2):""));
				else if(arguments[0] == "WARNING") console.log('%cWARNING%c %cTranslator%c: '+args[1],'color:white;background-color:#F9BC26;padding:2px;','','font-weight:bold;','',(args.length > 2 ? args.splice(2):""));
				else console.log('%cTranslator%c','font-weight:bold;','',args);
			}
		}
		return this;
	}

	Translator.prototype.setLanguage = function(lang){
		this.log('setLanguage',lang)
		// If a language is provided, set it
		if(lang) this.lang = lang;

		// Load the specified language
		this.loadLanguage(this.lang);

		return this;
	}

	Translator.prototype.loadLanguage = function(lang){
		this.log('loadLanguage',lang);
		if(!lang) lang = this.langdefault;

		// Is the language already loaded?
		if(this.langs[lang].filesloaded==this.langs[lang].files.length){
			this.log('Already loaded '+this.phrasebook['meta.name'][lang].value+' ('+lang+')');
			return this.processLanguage(lang);
		}

		// Set the loaded files counter for this language
		this.langs[lang].filesloaded = 0;

		for(var f = 0; f < this.langs[lang].files.length; f++){
			this.log('Loading file '+this.langs[lang].files[f]);
			
			S(document).ajax(this.langs[lang].files[f],{
				dataType: 'json',
				this: this,
				lang: lang,
				i: f,
				error: function(err,attr){
					// We couldn't find this language so load the English version
					// so there is something to work from.
					this.log('ERROR',"Couldn't load "+attr.lang)
					if(attr.lang != "en") this.loadLanguage('en');
				},
				success: function(data,attr){
					// Increment the loaded file counter
					this.langs[attr.lang].filesloaded++;
					// Loop over all the keys in the file
					for(var key in data){
						if(data[key]){
							if(!this.phrasebook) this.phrasebook = {};
							if(!this.phrasebook[key]) this.phrasebook[key] = {};
							this.phrasebook[key][attr.lang] = {'source':attr.url,'value':data[key] };
						}
					}
					// Got all the files for this language
					if(this.langs[attr.lang].filesloaded==this.langs[attr.lang].files.length) this.processLanguage(attr.lang);
				}
			});
		}

		return this;
	}
	
	Translator.prototype.processLanguage = function(lang){
		this.log('processLanguage',lang);
		
		if(lang){
			var hrefcat = S('a.langlinkcat').attr('href');
			S('a.langlinkcat').attr('href',hrefcat.substring(0,hrefcat.indexOf('?'))+'?lang='+this.phrasebook['meta.code'][lang].value);
			S('.langname').html(this.phrasebook['meta.name'][lang].value);
		}

		this.rebuildForm();

		return this;
	}

	Translator.prototype.rebuildForm = function(){
		this.log('rebuildForm',this.phrasebook);

		var html = "<form id=\"language\">"+this.buildForm()+"</form>";

		S('#translation').html(html);
		
		S('#translation input, #translation textarea, #translation select').attr('dir',(this.phrasebook && this.phrasebook["meta.alignment"] && this.phrasebook["meta.alignment"][this.lang]=="right" ? "rtl" : "ltr")).on('change',{me:this},function(e){
			console.log('change');
			e.data.me.getOutput();
			e.data.me.percentComplete();
			console.log(this);
		});

		return;

		// Update the text direction when the appropriate select box changes
		$('#translation select[name=".meta.alignment"]').on('change',function(e){
			$('#translation input, #translation textarea, #translation select').attr('dir',($(this).val()=="right" ? "rtl" : "ltr" ));
		});

		//this.getOutput();
		//this.percentComplete();

		return this;

	}


	Translator.prototype.buildForm = function(m,p,d,k){

		// m = this.masterbook
		// p = this.phrasebook
		// d = this.phrasebookdefault
		// k = ""

		var html = "";
		var newk = "";
		var inp = "";
		var arr = false;
		var n;
		var css;
		var ldef = this.phrasebook["meta.name"][this.langdefault].value;
		var inpdef="";

		if(!k) k = "";

		// Loop over the help file keys
		for(key in this.form){

			if(typeof this.form[key]==="object"){
				if(this.form[key]._text && this.form[key]._type){
					inp = "";
					cl= sanitize((this.form[key]._highlight ? "highlight" : ""))
					cl= sanitize((this.phrasebook && this.phrasebook[key] && this.phrasebook[key][this.lang] ? cl : "blank"));
					p = (this.phrasebook && this.phrasebook[key] && this.phrasebook[key][this.lang] ? this.phrasebook[key][this.lang].value : "");
					
					inpdef = (this.phrasebook[key] ? this.phrasebook[key].en.value : '');
					if(this.form[key]._type=="textarea"){
						css = (this.form[key]._height) ? ' style="height:'+this.form[key]._height+'"' : "";
						inp = '<textarea class="'+cl+'" name="'+newk+'"'+css+'>'+sanitize(p || (this.form[key]._usedef ? inpdef : ""))+'</textarea>';
					}else if(this.form[key]._type=="noedit"){
						inp = '<input type="hidden" name="'+newk+'" value="'+sanitize(p)+'" />'+sanitize(p);
						inpdef = "";
					}else if(this.form[key]._type=="select"){
						inp = '<select name="'+newk+'">';
						for(var o = 0; o < this.form[key]._options.length ; o++){
							var seldef = (d && this.form[key]._options[o].value==d[key]) ? ' selected="selected"' : '';
							var sel = (p && this.form[key]._options[o].value==p) ? ' selected="selected"' : (this.form[key]._usedef) ? seldef : '';
							inp += '<option value="'+this.form[key]._options[o].value+'"'+sel+'>'+this.form[key]._options[o].name+'</option>'
							if(this.form[key]._options[o].value == inpdef) inpdef = this.form[key]._options[o].name;
						}
						inp += '</select>';
					}else if(this.form[key]._type=="string"){
						inp = '<input type="text" class="'+cl+'" name="'+newk+'" value="'+sanitize(p || (this.form[key]._usedef ? inpdef : ""))+'" />';
					}
					html += this.row((this.form[key]._title ? this.form[key]._title : key),this.form[key]._text,inp,ldef,inpdef);
				}else{

					// If this section has a title
					if(this.form[key]._level){
						l = this.form[key]._level;
						html += '<h'+l+'>'+this.form[key]._title+'</h'+l+'>';
					}
					if(this.form[key]._text){
						html += "	<div class=\"subt\">";
						html += "		<p>"+this.form[key]._text+"</p>";
						html += "	</div>";
					}
					if(n >= 0) html += '<div class="group">';
				}
			}
		}

		return html;
	}

	Translator.prototype.percentComplete = function(){
		var percent = 100;
		if(this.lang!="en"){
			var total = 0;
			var diff = 0;
/*
			for(var i = 0 in this.chromo.phrasebook){
				if(i!="alignment" && i!="code" && i != "lang" && i!="helpmenu" && i!="gal" && i!="eq" && i!="version"){
					total++;
					var val = converter($("#"+i).val()).replace(/&amp;/g,"&");
					if(this.q.debug) console.log(i,val,this.english[i])
					if(val && val != this.english[i]){
						diff++;
//						$("#fs_"+i).removeClass('same');
					}else{
//						$("#fs_"+i).addClass('same');
					}
				}
			}
*/
			percent = Math.floor(100*diff/total);
		}
		$("#complete").html(percent);
	}

	Translator.prototype.row = function(title,desc,field,ldef,def){
		var id = field.indexOf("id=\"");
		id = field.substr(id+4);
		id = id.substr(0,id.indexOf("\""));

		var html = "	<fieldset>";// id=\"fs"+id+"\">";
		html += "		<legend>"+title+"</legend>";
		html += "		<div class=\"twocol\">";
		html += "			<p>"+desc+"</p>";
		html += "		</div>";
		html += "		<div class=\"fourcol\">";
		html += "			"+field;
		html += "			<div class=\"default\"><strong>"+ldef+" (default):</strong> "+def+"</div>";
		html += "		</div>";
		html += "	</fieldset>";
		// html = "	<div>";// id=\"fs"+id+"\">";
		// html += "		<div class=\"twocol\">";
		// html += "			<p>&nbsp;</p>";
		// html += "		</div>";
		// html += "		<div class=\"fourcol default\">";
		// html += "			"+def;
		// html += "		</div>";
		// html += "	</div>";
		return html;
	}
	Translator.prototype.getOutput = function(){
		var json = sanitize(S("#language").formToJSON(this));
		console.log(json);
		//json = json.substring(0,json.length-4).substring(17).replace(/\n\t\t/g,'\n\t')+'}';
		var css = (json) ? ' style="height:'+(json.split("\n").length + 5)+'em;font-family:monospace;"' : ''
		var output = '<textarea onfocus="this.select()"'+css+' wrap="off">'+json+"</textarea>";

		if($('#output').length == 0) $('#translation').after('<div id="output"></div>')

		$('#output').html(output);
	}


	/* From http://exceptionallyexceptionalexceptions.blogspot.co.uk/2011/12/convert-html-form-to-json.html */
	stuQuery.prototype.formToJSON = function(t) {

		function setValue(object, key, value) {
			// // Don't need to split keys on "."
			// var a = path.split('.');
			// // Instead, just use the full key
			var a = [key];
			var o = object;
			for (var i = 0; i < a.length - 1; i++) {
				var n = a[i];
				if (n in o) {
					o = o[n];
				} else {
					o[n] = {};
					o = o[n];
				}
			}
			o[a[a.length - 1]] = value;
		}

		if(t.phrasebook){

			// First of all we need to get a copy of the original JSON structure
			// otherwise we loose arrays
			// var objectG = JSON.parse(JSON.stringify(t.phrasebook));
			var objectG = {}
			console.log(objectG)
			//loop through all of the input/textarea elements of the form
			var el = this.find('input, textarea, select').each(function(i){
				//ignore the submit button
				if($(this).attr('name') != 'submit') setValue(objectG,$(this).attr('name').substr(1),converter($(this).val()))
			})
		}

		return JSON.stringify(objectG,null, " ");
	};


	function converter(tstr) {
		if(!tstr) return "";
		return tstr;
		// // Don't want to convert character codes
		// var bstr = '';
		// for(var i=0; i<tstr.length; i++){
		// 	if(tstr.charCodeAt(i)>127) bstr += '&amp;#' + tstr.charCodeAt(i) + ';';
		// 	else bstr += tstr.charAt(i);
		// }
		// return bstr;
	}
	function sanitize(str){
		if(str){
			str = str.replace(/</g,"&lt;");
			str = str.replace(/>/g,"&gt;");
			str = str.replace(/"/g,"&quot;");
		}
		return str;
	}

	// Add CommonGround as a global variable
	root.Translator = Translator;

})(window || this); // Self-closing function

