
public class CompiledFile {
	private String sourcePath, destinationPath, compiledCode, error;
	
	public CompiledFile(String sp, String dp, String c, String e){
		this.sourcePath = sp;
		this.destinationPath = dp;
		this.compiledCode = c;
		this.error = e;
	}
	
	public String getSourcePath(){
		return this.sourcePath;
	}
	
	public String getDestinationPath(){
		return this.destinationPath;
	}
	
	public String getCompiledCode(){
		return this.compiledCode;
	}
	
	public String getErrors(){
		return this.error;
	}
	
	public Boolean hasErrors(){
		if(this.error.equals("")){
			return false;
		}else{
			return true;
		}
	}
}
