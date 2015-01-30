
public class MissingDepedencyException extends Exception {

	public MissingDepedencyException(String filename) {
		super("Compiler can't find source file " + filename);
	}
}
