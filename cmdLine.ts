/// <reference path="../DefinitelyTyped/node/node.d.ts"/>

import {zrfNodes, _emitSampleCompilerPass, _emitCompilerPassInterface} from "./zrfTypes";
import {zrfCompile} from "./zrfCompiler";
import {zrfPrettyPrint} from "./zrfUtils";
import {rulesCompile} from "./rulesCompiler";
import * as fs from "fs";

var zrf = zrfCompile(fs.readFileSync(process.argv[2], "utf8"));

console.log  (zrfPrettyPrint(zrf))