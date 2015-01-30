/* ***** BEGIN LICENSE BLOCK *****
 * Copyright (C) 2011 by Roger Poon
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:

 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.

 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * ***** END LICENSE BLOCK ***** */

var jsdef = this.narcissus.jsdef;

function compiler(ast, options) {
	var _this = this;

	//Compiler options:
	//compiler.options = {
	//  debug: Boolean //Line #s will be same in compiled code as source code
	//  nowrap: Boolean //Don't wrap the code with (function(global){...}).call({},this)
	//  warnings: Boolean //Enable/disable warnings
	//};
	this.options = options || { debug: true, warnings: true };
	this.ast = ast;

	this.errors = [];
	this.warnings = [];
	this.NewWarning = function (e, node) {
		if (!this.options.warnings) return false;

		if (node) {
			e.line = node.lineno;
		}
		e.category = "Warning";
		e.chara = {
			start: node.start,
			end: node.end
		};
		e.toString = function(){ return this.message.toString() };

		//If we're in the DOM, log this warning to the console
		if (typeof window == "object" && typeof console != "undefined") {
			console.log(e);
		}

		this.warnings.push(e);
	};
	this.NewError = function (e, node) {
		if (node) {
			e.line = node.lineno;
		}
		e.category = "Error";
		e.chara = {
			start: node.start,
			end: node.end
		};
		e.toString = function(){ return this.message.toString() };

		this.errors.push(e);

		//If we're in the DOM, log this error to the console
		if (typeof window == "object" && typeof console != "undefined") {
			console.log(e);

			throw e;
		}
	};

	this.lineno = -1; //Keep track of line numbers to compile debuggable code

	var VarPush = function(x) {
		for (var i=0, len=this.length; i<len; i++) {
			if (this[i].identifier === x.identifier) break;
		}
		i == len && Array.prototype.push.apply(this, Array.isArray(x) ? x : [x]);
	};

	//Emulate execution contexts
	this.ExecutionContexts = {};
	this.ExecutionContextsArray = [];
	this.CreateExecutionContext = function(contextId) {
		_this.ExecutionContextsArray.push(_this.ExecutionContexts[contextId] = {
			//ES3-compatible activation object
			ActivationObject:{
				"arguments":{
					value: {
						length:{
							value: 0,
							"[[DontEnum]]": true
						}
					},

					"[[Prototype]]": Object.prototype,
					"[[ReadOnly]]": false,
					"[[DontDelete]]": true
				}
			},

			//List of all variables declared in the execution context
			Variables: [],

			//Internal state for next block variable identifier
			NextBlockVariable: [97],

			//Save scoped object extensions
			Extensions: []
		});

		_this.ExecutionContexts[contextId].push = VarPush;
	};

	this.context = null; //Current execution context

	this.GetContext = function(x) {
		return this.context = this.ExecutionContexts[x];
	};

	this.GetCurrentContext = function() {
		return this.ExecutionContextsArray[this.ExecutionContextsArray.length-1] ||
				this.ExecutionContextsArray[0];
	};

	this.ExitContext = function() {
		this.ExecutionContextsArray.pop();
	};

	//Scopes are NOT the same as execution contexts here due to block scope
	this.scopes = {};
	this.scopeChain = [];
	this.ScopeId = "_bScope"; //Block scope temporary variable identifier
	this.currentScope = 0;
	this.StatementBlocks = 0; //e.g. if (1) let x = 10; <-- no block { ... } present

	this.NewScope = function(id, node) {
		this.scopes[id] = node;
		this.scopeChain.push(node);
		this.currentScope = this.ScopeId + node.scopeId;

		node.Variables = [];
		node.BlockVariables = [];
		node.Functions = []; //Function declarations, not expressions

		node.Variables.push = node.BlockVariables.push = VarPush;

		/*node.Functions.push = function(x) {
			for (var i=0, len=this.length; i<len; i++) {
				if (this[i].name === x.name) break;
			}
			i == len && Array.prototype.push.apply(this, Array.isArray(x) ? x : [x]);
		};*/

		//Map block scoped variable identifiers
		//  oldIdentifier: newIdentifier
		node.map_BlockVars = {};

		//Run the TypeCheck function to notify that we've created a new scope
		this.TypeCheck(node);

		//If this is the global scope, push some declarations to avoid compiler warnings
		if (this.scopeChain.length == 1) {
			//Note: Include es3.js or this won't run
			if (typeof CreateGlobal == "function") {
				CreateGlobal(node);
			}
			else {
				this.NewWarning({
					type: ReferenceError,
					message: 'Compiler global header file "typed-es3.js" not found.'
				}, {lineno: -1});
			}
		}

		return this.scopeChain[this.scopeChain.length-1];
	};

	this.ExitScope = function() {
		if (typeof this.scopeChain[this.scopeChain.length-1].typesys != "undefined") {
			this.typeSystems.pop();
		}

		this.currentScope = this.ScopeId + this.scopeChain.pop().scopeId;
	};

	this.CurrentScope = function() {
		return this.scopeChain[this.scopeChain.length-1];
	};

	this.CurrentFunction = function(currentScopeId) {
		var currentScope;
		if (currentScope = this.scopeChain[currentScopeId] || this.scopeChain[currentScopeId]) {
			if (currentScope.isFunction) {
				return currentScope;
			}
			else if (currentScope !== _this.scopeChain[0]) {
				this.CurrentFunction(--currentScopeId);
			}
		}

		return null;
	};

	//Handle "pseudo-blocks" e.g. for (;;) let x = 10; where there is no { ... }
	this.NewPseudoBlock = function(out, generate, Node, Statement, inLoop) {
		Node.scopeId = "Stmt" + (++this.StatementBlocks);
		this.NewScope(Node.scopeId, Node);
		if (Statement.type == jsdef.LET) {
			out.push("{");
			!inLoop && out.push(this.ScopeId + Node.scopeId + "={};");
			out.push(generate(Statement) + "}");
		}
		else {
			out.push(generate(Statement));
		}

		this.ExitScope();
	};

	//Get the current scope based on regular JS scoping rules (nearest function or global only)
	this.ScopeJS = function(currentScopeId) {
		return this.CurrentFunction(currentScopeId) ||  this.scopeChain[0];
	};

	this.isGlobalScope = function(x) {
		return this.scopeChain.length === 1;
	};

	this.typeSystem = null;
	//this.conditionals - keeps track of conditionals
	//useful for if (1) { var a as Number; } else { var a as String; }
	this.conditionals = [];
	this.TypeCheck = function(Node) {
		this.typeSystem !== null && this.typeSystem.typesys(Node, this);
	};

	//Traverses scope chain until findIdentifier is found starting at currentScopeId
	this.LookupScopeChain = function (findIdentifier, currentScopeId, callback, property) {
		var found = false, isBlockVariable = false, isClassMember = false, data;
		var currentScope = _this.scopeChain[currentScopeId] || _this.scopeChain[0];
		var Variables = currentScope.Variables, classScopeId = -1;
		var Functions = currentScope.Functions, isFunDecl = false;

		//Search function declarations first (not function expressions)
		for (var i=0, len=Functions.length; i < len; i++) {
			if (Functions[i].name === findIdentifier) {
				found = true;
				isFunDecl = true;

				data = Functions[i];

				break;
			}
		}

		//Search variable declarations after function declarations
		for (var i=0, len=Variables.length; i < len; i++) {
			if (Variables[i].identifier === findIdentifier) {
				found = true;

				if (Variables[i]["[[ClassMember]]"]) {
					isClassMember = true;
					classScopeId = Variables[i]["[[ClassId]]"];
				}

				data = Variables[i];

				break;
			}
		}

		//Finally, check if this is a block scoped variable
		if (currentScope.map_BlockVars.hasOwnProperty(findIdentifier)) {
			found = true;
			isBlockVariable = true;
			isClassMember = false;
			data = currentScope.map_BlockVars[findIdentifier];
		}

		//Keep moving up the chain until we find the variable
		if (!found && currentScope !== _this.scopeChain[0]) {
			_this.LookupScopeChain(findIdentifier, --currentScopeId, callback);

			return;
		}

		if (found) {
			typeof callback == "function" && callback({
				found: true,
				scopeId: currentScope.scopeId,
				classScopeId: classScopeId,
				isBlockVariable: isBlockVariable,
				isClassMember: isClassMember,
				isFunctionDecl: isFunDecl,
				data: data
			});
		}
		else {
			typeof callback == "function" && callback(false);
		}
	};

	//Create temporary variables
	var tmpVarIndex = 0;
	this.CreateTempVar = function() {
		var tmp = "__TMP" + (++tmpVarIndex) + "__";

		while(~this.varCache.indexOf(tmp)) tmp = "__TMP" + (++tmpVarIndex) + "__";

		this.varCache.push(tmp);

		return tmp;
	};
	this.varCache = []; //Keep track of used identifiers - including lexically scoped vars
	this.varCache.push = function(x) { //Modify push function to avoid duplicates
		!~this.indexOf(x) && Array.prototype.push.apply(this, Array.isArray(x) ? x : [x]);
	};
	this.PushToVarCache = function(nodes) {
		for (var i=0, item, len=nodes.length; i<len; i++) {
			if (nodes[i].type == jsdef.LET) continue;

			for (item in nodes[i]) {
				if (!isFinite(item)) continue;

				if (nodes[i][item].type == jsdef.IDENTIFIER) //In case of destructuring assignments
					this.varCache.push(nodes[i][item].value);
			}
		}
	};

	//Reduce functions
	this.reduceVarInit = function(node) {
		switch(node.type) {
			case jsdef.GROUP:
			case jsdef.CALL:
				return this.reduceVarInit(node[0]);
			case jsdef.COMMA:
				return this.reduceVarInit(node[node.length-1]);
			case jsdef.OBJECT_INIT:
			case jsdef.FUNCTION:
				return node;
			default:
				break;
		}
	};

	//Types
	//Define default values
	this.types = {
		"Array": {
			"default": "[]"
		},
		"Boolean": {
			"default": "false"
		},
		"Date": {
			"default": "new Date"
		},
		"Function": {
			"default": "function(){}"
		},
		"Null": {
			"default": "null"
		},
		"Number": {
			"default": "0"
		},
		"Object": {
			"default": "{}"
		},
		"RegExp": {
			"default": "/(?:)/"
		},
		"String": {
			"default": '""'
		},

		//Typed arrays
		"Array[]": {
			"default": "[]"
		},
		"Boolean[]": {
			"default": "[]"
		},
		"Date[]": {
			"default": "[]"
		},
		"Function[]": {
			"default": "[]"
		},
		"Number[]": {
			"default": "[]"
		},
		"Object[]": {
			"default": "[]"
		},
		"RegExp[]": {
			"default": "[]"
		},
		"String[]": {
			"default": "[]"
		}
	};
	//Return [[Prototype]] based on type
	this.GetProto = function(s) {
		if (typeof CreateGlobal != "function") return void 0;
		switch(s) {
			//Built-in objects
			case "Array": return CreateGlobal.Array.properties.prototype;
			case "Boolean": return CreateGlobal.Boolean.properties.prototype;
			case "Date": return CreateGlobal.Date.properties.prototype;
			case "Function": return CreateGlobal.Function.properties.prototype;
			case "Number": return CreateGlobal.Number.properties.prototype;
			case "Object": return CreateGlobal.Object.properties.prototype;
			case "RegExp": return CreateGlobal.RegExp.properties.prototype;
			case "String": return CreateGlobal.String.properties.prototype;
			case "Error":
			case "EvalError":
			case "RangeError":
			case "ReferenceError":
			case "SyntaxError":
			case "TypeError":
			case "URIError":
				return CreateGlobal.Error.properties.prototype;

			//TODO: Typed arrays
		}
	};

	this.currentLabel = ""; //Labels for loops
	this.breakStmt = ""; //Track break statements
	this.continueStmt = ""; //Track continue statements
	this.inCase = false; //Are we inside a case/default statement?

	//Classes
	this.currentClass = "";
	this.classId = "";
	this.classMembers = {};
	this.classScopes = [];
	this.classes = {};
	this.classVars = [];

	this.NewClass = function(Node) {
		this.currentClass = Node.name || "";
		this.classScope = this.classScopes.push(this.NewScope(Node.scopeId, Node));

		this.classes[Node.body.scopeId] = {
			id: Node.name,
			__SUPER__: Node.extends || "",
			protectedMembers: [],
			publicMembers: []
		};
	};

	this.CurrentClass = function() {
		return this.classScopes[this.classScopes.length-1];
	};

	this.CurrentClassName = function() {
		return this.classScopes[this.classScopes.length-1].name;
	};

	this.ChainedClassName = function() {
		var ret = [];

		for (var i=0, k=this.classScopes, len=k.length; i<len; i++) {
			ret.push(k[i].name);
		}

		return ret;
	};

	this.AdjustedChainedClassName = function() {
		//Are we inside a static class expression?
		for (var i=0,k=this.classScopes,len=k.length;i<len;i++) {
			if (k[i].static) break;
		}

		if (this.classScopes.length > 1 && i === k.length) {
			return this.CurrentClassName();
		}
		else {
			return this.ChainedClassName().join(".");
		}
	};

	this.CurrentClassScopeId = function() {
		return this.classScopes[this.classScopes.length-1].body.scopeId;
	};

	this.InsideClass = function() {
		return this.scopeChain[this.scopeChain.length-1] &&
			   this.scopeChain[this.scopeChain.length-1].type == jsdef.CLASS;
	};

	this.InsideStaticMember = function() {
		return this.classVars.length &&
				(!!this.classVars[this.classVars.length-1].static ||
				 !!this.classVars[this.classVars.length-1].body.static);
	};

	this.ExitClass = function() {
		this.currentClass = "";
		this.classMembers = {};
		this.classScopes.pop();
		delete this.classScope;
		this.ExitScope();
	};
}
compiler.prototype.typesys = {}; //Storage for pluggable type systems