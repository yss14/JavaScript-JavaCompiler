import java.io.BufferedReader;
import java.io.BufferedWriter;
import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;
import java.io.IOException;
import java.util.ArrayList;

import javax.script.ScriptEngine;
import javax.script.ScriptEngineManager;
import javax.script.ScriptException;

import org.json.JSONObject;


public class JavaScriptPPCompiler {

	private static ScriptEngineManager engineManager;
	private static ScriptEngine engine;
	private static Boolean hasBeenInit = false;
	
	private static void initCompiler() throws MissingDepedencyException, IOException{
		engineManager = new ScriptEngineManager();
		engine = engineManager.getEngineByName("nashorn");
		
		ArrayList<String> jsppFiles = new ArrayList<String>();
		
		jsppFiles.add("lib/jspp/lib/jspp/lang/es5.js");
		jsppFiles.add("lib/jspp/src/jsdefs.js");
		jsppFiles.add("lib/jspp/src/jsparse.js");
		jsppFiles.add("lib/jspp/src/typed-es3.js");
		jsppFiles.add("lib/jspp/src/compiler.js");
		jsppFiles.add("lib/jspp/src/compiler2.js");
		jsppFiles.add("lib/jspp/typesys/strict.js");
		jsppFiles.add("lib/jspp/src/beautify.js");
		jsppFiles.add("lib/jspp/wrapper.js");
		
		for(String s : jsppFiles){
			try {
				System.out.println("Reading dependency " + s + "...");
				engine.eval(readFileContent(s, false));
			} catch (ScriptException e) {
				throw new MissingDepedencyException(s);
			}
		}
	}
	
	public static CompiledFile compileFile(String sourcePath, String destinationPath) throws IOException, MissingDepedencyException{
		if(!hasBeenInit){
			initCompiler();
		}
		
		CompiledFile cf;
		
		try {
			String jppString = readFileContent(sourcePath, true);
			
			String jsonCode = (String) engine.eval("compileFile(\"" + jppString + "\")");
			
			JSONObject obj = new JSONObject(jsonCode);
			
			if(obj.getString("errors").equals("")){
				cf = new CompiledFile(sourcePath, destinationPath, obj.getString("compiledCode"), "");
				
				if(!destinationPath.equals("")){
					System.out.println("Writing compiled code to " + destinationPath + "...");
					BufferedWriter bwr = new BufferedWriter(new FileWriter(new File(destinationPath)));
					
					bwr.write(obj.getString("compiledCode"));
					bwr.flush();
					bwr.close();
				}
			}else{
				cf = new CompiledFile(sourcePath, destinationPath, "", obj.getString("errors"));
			}
		} catch (ScriptException e) {
			e.printStackTrace();
			cf = new CompiledFile(sourcePath, destinationPath, "", "Compiler Error: " + e.toString());
		}
		
		return cf;
	}
	
	public static void main(String[] args) throws MissingDepedencyException{
		
		try {
			CompiledFile f = compileFile("test/test.jpp", "/Users/yss/Desktop/test.js");
			System.out.println(f.getCompiledCode());
		} catch (IOException e) {
			e.printStackTrace();
		}
		
				
	}
	
	private static String readFileContent(String path, Boolean minimize) throws IOException{
		BufferedReader br;
		br = new BufferedReader(new FileReader(path));
		StringBuilder sb = new StringBuilder();
		String line = br.readLine();

		while (line != null) {
			sb.append(line);
			if(!minimize){
				sb.append(System.lineSeparator());
			}else{
				sb.append(" ");
			}
			line = br.readLine();
		}
		return sb.toString();
	}

}
