# JavaScriptPP JavaCompiler

A little java program which compiles js++ code to plain js.

This little java program will help you to compile a little or large amount of js++ files to plain javascript.
Important: You need Java 8 because of the "nashorn"-runtime!

Here's a little example:

CompiledFile f = compileFile("test/test.jpp", "/Users/yss/Desktop/test.js");
System.out.println(f.getCompiledCode());


Used projects:
- JavaScript++ (http://jspp.javascript.am)
- org.json (https://github.com/douglascrockford/JSON-java)