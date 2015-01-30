function compileFile(jsppCode){
	var json = {
		"compiledCode" 	: "",
		"errors"		: "",
	}
	
	try{
		var c = new compiler(narcissus.jsparse(jsppCode), {
			//Compiler options here
			debug: true,
			nowrap: false,
			warnings: true
		});
		c.preprocess();
		compiledCode = c.compile();
		
		json["compiledCode"] = compiledCode;
	}catch(e){
		json["errors"] = e.toString();
	}
	
	return(JSON.stringify(json));
}