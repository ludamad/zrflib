import {SExp, sexpParse} from "./sexpParser";
// We must replace defines before passing to zrfTypes:
import {zrfNodes, zrfTypesWithNoMacros} from "./zrfTypes";
import {zrfPrettyPrint} from "./zrfUtils";

import {arrayContains, hasProperty, assert} from "./common/common";
import {sexpToList, sexprMap, sexprCopy, sexprVisitNamed} from "./sexpUtils";

////////////////////////////////////////////////////////////////////////////////
// Public interface
////////////////////////////////////////////////////////////////////////////////

// Main export:
export function zrfCompile(content:string):zrfNodes.File {
    var sexp = sanitizeAndSexpParse(content);
    // Resolve all macros:
    sexp = findAndReplaceDefines(sexp);
    return zrfTypesWithNoMacros(sexp);
}

////////////////////////////////////////////////////////////////////////////////
// Testing interface
////////////////////////////////////////////////////////////////////////////////

// Raw s-expression parsing:
export function sanitizeAndSexpParse(content):SExp {
    // Keep our parser simple by sanitizing parts of the file, for now (TODO integrate into parser maybe
    // Remove comments:
    content = content.replace(/;[^\n]*/g, "");
    // Replace \ with /:
    content = content.replace(/\\/g, "/");
    // Parse a list:
    content = "(" + content + ")";
    return sexpParse(content);
}

////////////////////////////////////////////////////////////////////////////////
// Macro subsitution logic:
////////////////////////////////////////////////////////////////////////////////

function replaceDollarSignArguments(sexp, args:(string|SExp)[]):(string|SExp) {
    var replacements = {};
    for (var i = 0; i < args.length; i++) {
        replacements["$" + (i+1)] = args[i];
    }
    function replace(sexp):string|SExp {
        if (sexp == null || typeof sexp === "string") {
            return sexp;
        }
        if (hasProperty(replacements, sexp.head)) {
            return {head: sexprCopy(replacements[sexp.head]),
                    tail: <SExp> replace(sexp.tail)};
        }
        return sexprMap(sexp, replace);
    }
    return replace(sexp);
}

function findAndReplaceDefines(fileSexp:SExp):SExp {
    // Gather defines from the top level:
    var defines = [];
    let definingNodes = [];
    for (var node of sexpToList(fileSexp)) {
        if (typeof node !== "string" && node.head === "define") {
            let {head: name, tail: replacement} = node.tail;
            definingNodes.push(node);
            defines.push({name, replacement});
        }
    }
    let newResult:SExp = fileSexp;
    // TODO & NOTE: Macro recursion *will* infinite loop this thingy.
    while (true) {
        var didChange = false;
        function pass(sexp) {
            if (sexp !== null && typeof sexp === "object") {
                var {head, tail} = sexp;
                if (arrayContains(definingNodes, head)) {
                    // Don't set didChange to true here because removing a 
                    // define will never require another compilation pass to resolve.
                    return pass(tail);
                }
                if (head && head.head && typeof head.head === "string") {
                    for (var {name, replacement} of defines) {
                        if (head.head === name) {
                            didChange = true;
                            let replaced = <SExp> replaceDollarSignArguments(replacement, sexpToList(head.tail));
                            let endTail = replaced;
                            while (endTail.tail !== null) {
                                endTail = endTail.tail;
                            }
                            // NOTICE: Uses mutation based on fact replaceDollarSignArguments returns fresh object
                            endTail.tail = pass(tail);
                            return replaced;
                        }
                    }
                }
            }
            return sexprMap(sexp, pass);
        }
        newResult = <SExp>pass(newResult);
        if (!didChange) {
            break;
        }
    }
    return newResult;
}

