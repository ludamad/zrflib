"use strict";

import {SExp} from "./sexpParser"
import {arrayCopy, arrayContains, arrayRemove} from "./common/common"
import {sexpToList, sexpToSexps, sexpToStrings, sexpToPairs, 
    sexpToLabeledPair, sexpStringCast, sexpToStringPair, sexpBoxIfString,
    sexpFoldStringPairs, sexpToInts, sexpCheckLabeled} from "./sexpUtils";

////////////////////////////////////////////////////////////////////////////////
// Main exported function.
////////////////////////////////////////////////////////////////////////////////

export function zrfTypesWithNoMacros(sexp:SExp): zrfNodes.File{
    var model = new zrfNodes.File();
    model.processSubnodes(sexp);
    return model;
};

function _parse(type:any, name?:string|number, optional:boolean = false) : PropertyDecorator {
    return (target, propertyKey: string) => {
        if (typeof name === "number") {
            target._nextId = name + 1;
        }
        target._subevents = target._subevents || {};
        // console.log(target, propertyKey)
        target._subevents[name != null ? name : propertyKey] = {propertyKey, type, optional};
    }
}

function parseNamed(type:any, name?:string) : PropertyDecorator {
    return _parse(type, name);
}

function parseNamedOptional(type:any, name?:string) : PropertyDecorator {
    return _parse(type, name, true);
}

// Precludes use of all other 'parse' methods (including itself!)
function parseRest(parseFunc:Function) {
    return (target, propertyKey: string) => {
        // assert(!target._subevents);
        target.processSubnodesWorker = function(sexp) {
            this[propertyKey] = parseFunc(sexp);
        }
    };
}
function parsePositional(type:any, index?:number, optional?: boolean) {
    return (target, propertyKey: string) => {
        _parse(type, index || target._nextId || 0, optional)(target, propertyKey);
    }
}

function parsePositionalOptional(type:any, index?:number) {
    return parsePositional(type, index, true);
}

interface StrMap<T> {
    [s: string]: T;
}

function hasOwnProperty(obj:Object, key:string) {
    return Object.prototype.hasOwnProperty.call(obj, key);
}

////////////////////////////////////////////////////////////////////////////////
// Classes for the ZRF object model. Define parsing events with metadata.
// The names of the classes themselves are used for matching events triggered.
////////////////////////////////////////////////////////////////////////////////
export namespace zrfNodes {
    export abstract class Node {
        /* Not actually set on class, used to declare the setting above: */
        _subevents:StrMap<{propertyKey:string, type:any, optional:boolean}>;
        _classname:string;
        processSubnodes(sexp:SExp) {
            try {
                this.processSubnodesWorker(sexp);
            } catch (e) {
                console.log(`Error parsing "${this._classname}"!`);
                throw e;
            }
        }

        processSubnodesWorker(sexp:SExp) {
            let members = Object.keys(this._subevents || {});
            let indexKeys:number[]  = members.filter(x => !isNaN(+x)).map(id => +id);
            let stringKeys = members.filter(x =>  isNaN(+x));
            let unusedStringKeys = arrayCopy(stringKeys);

            // Get the list of values to pick members out of:
            let sexpList:(SExp|string)[] = sexpToList(sexp);
            // Handle numeric keys specially, as position dependent:
            for (let key of indexKeys) {
                let indexSexp = sexp;
                for (let i = 0; i < key && indexSexp; i++) {
                    indexSexp = indexSexp.tail;
                }
                if (indexSexp == null) {
                    if (!this._subevents[key].optional) {
                        console.log(`WARNING Did not find non-optional positional attribute ${key}:${this._subevents[key].type} on ${this._classname}!`)
                    }
                    continue;
                }
                if (typeof this._subevents[key].type === "function") {
                    indexSexp = (<SExp>indexSexp.head);
                }
                zrfChildParse(this, key.toString(), indexSexp, this._subevents[key]);
            }
            // Handle named keys as non-position dependent:
            for (let i = 0; i < sexpList.length; i++) {
                if (arrayContains(indexKeys, i)) {
                    continue;
                }
                let sexp = sexpList[i];
                if (typeof sexp !== "string") {
                    let {head, tail} = sexp;
                    let parsed = false;
                    // console.log({head, tail});
                    if (typeof head === "string" && arrayContains(stringKeys, head)) {
                        zrfChildParse(this, head, tail, this._subevents[head]);
                        arrayRemove(unusedStringKeys, head);
                        parsed = true;
                    }
                    if (!parsed) {
                        console.log(`**NYI: ${this._classname} ${JSON.stringify(head)}`);
                    }
                }
            }
            for (let unused of unusedStringKeys) {
                if (!this._subevents[unused].optional) {
                    console.log(`WARNING Did not find non-optional attribute ${unused} on ${this._classname}!`)
                }
            }
        }
    }

    export class File extends Node {
        @parseNamedOptional("string") version:string;
        @parseNamed("Game") game:Game;
        @parseNamedOptional("Variant[]", "variant" /* Subevent name */)
            variants:Variant[];
    }

    export class Directions extends Node {
        dirs:{name:string, dx:number, dy:number}[] = [];
        processSubnodesWorker(dirs:SExp) {
            for (var dir of sexpToSexps(dirs)) {
                var [name, dx, dy] = sexpToStrings(dir);
                this.dirs.push({name, dx: parseInt(dx), dy: parseInt(dy)});

            }
        }
    }

    export class Dimensions extends Node {
        xLabels:string[];
        yLabels:string[];
        x1:number; 
        x2:number;
        y1:number; 
        y2:number;
        width:number;
        height:number;
        processSubnodesWorker(dirs:SExp) {
            var [cols, rows] = sexpToSexps(dirs);
            var [yLabels, yBnds] = sexpToLabeledPair(rows);
            var [xLabels, xBnds] = sexpToLabeledPair(cols);
            var [x1, x2] = sexpToStringPair(xBnds);
            var [y1, y2] = sexpToStringPair(yBnds);
            this.x1 = parseInt(x1), this.x2 = parseInt(x2);
            this.x1 = parseInt(y1), this.x2 = parseInt(y2);
            this.xLabels = xLabels.split("/");
            this.yLabels = yLabels.split("/");
            this.width = this.xLabels.length;
            this.height = this.yLabels.length;
        }
    }

    function parsePlayerImageList(sexp:SExp, obj) {
        obj.images = obj.images || {};
        let player = null;
        for (let value of sexpToStrings(sexp)) {
            let lowerCaseValue = value.toLowerCase();
            if (lowerCaseValue.indexOf(".png") > 0 || lowerCaseValue.indexOf(".bmp") > 0) {
                obj.images[player] = obj.images[player] || [];
                obj.images[player].push(value);
            } else {
                player = value;
            }
        }
        return obj.images;
    }

    export class Attribute extends Node {
        @parsePositional("string")
            name:string;
        @parsePositional("string")
            initialValue:string;
    }
    export class Piece extends Node {
        @parseNamed("string")
            name:string;
        /* Extension to the ZRF format to allow AI hinting.
         * Generally, I do not trust auto-inference of static values. */
        @parseNamedOptional(parseInt)
            aiValue:number;
        @parseNamedOptional("string")
            description:string;
        @parseNamed("string")
            help:string;
        @parseNamed(parsePlayerImageList, "image")
            images:StrMap<string[]>;
        // If the object has a drops field:
        @parseNamedOptional("Drops")
            drops:Drops;
        // If the object has a moves field:
        @parseNamedOptional("Moves")
            moves:Moves;
        @parseNamedOptional("Attribute[]", "attribute")
            attributes:Attribute[];
    }
    
    export class Drops extends Node {
        drops:Statement[][];
        processSubnodesWorker(drops:SExp) {
            this.drops = sexpToList(drops).map(parseStatementList);
        }
    }
    export class Moves extends Node {
        moves:Statement[][];
        processSubnodesWorker(moves:SExp) {
            this.moves = sexpToList(moves).map(parseStatementList);
        }
    }

    export class Grid extends Node {
        @parseNamed((sexp:SExp) => {
            var [x1,y1,x2,y2] = sexpToInts(sexp);
            return {x1,y1,x2,y2};
        })
            "start-rectangle": {x1:number, y1:number, x2:number, y2:number};
        @parseNamed("Dimensions")
            dimensions:Dimensions;
        @parseNamed("Directions")
            directions:Directions;
    }

    export class Symmetry extends Node {
        playerId:string;
        directionPairs:[string,string][];
        processSubnodesWorker(sexp:SExp) {
            let {head, tail} = sexp;
            this.playerId = sexpStringCast(head);
            this.directionPairs = sexpToList(tail).map(sexpToStringPair);
        }
    }

    export class Board extends Node {
        @parseNamed("string") image:string;
        @parseNamed("Grid") grid:Grid;
        @parseNamedOptional("Symmetry") symmetry:Symmetry;
        @parseNamedOptional("Zone[]", "zone") zones:Zone[];
        processSubnodesWorker(sexp:SExp) {
            super.processSubnodesWorker(sexp);
        }
    }

    export class Zone extends Node {
        @parseNamed("string") name:string;
        @parseNamed("string*") players:string[];
        @parseNamed("string*") positions:string[];
    }

    type PiecePlacements = {piece:string, squares:string[]}[];
    type BoardSetupComponent = {player: string, pieces: PiecePlacements};

    export class BoardSetup extends Node {
        components : BoardSetupComponent[] = [];

        processSubnodesWorker(sexp:SExp) {
            for (var {head: player, tail: pieceSetups} of sexpToSexps(sexp).map(sexpCheckLabeled)) {
                var pieces:PiecePlacements = [];
                for (var {head: piece, tail: squares} of sexpToSexps(pieceSetups).map(sexpCheckLabeled)) {
                    pieces.push({piece, squares: sexpToStrings(squares)});
                }
                this.components.push({player, pieces});
            }
        }
    }

    export class EndCondition extends Node {
        players:string[];
        condition:Condition;
        processSubnodesWorker(components:SExp) {
            // Parse conditions in separate file, same as directionality stuff.
            var [playersSexp, condition] = sexpToList(components).map(sexpBoxIfString);
            this.players = sexpToStrings(playersSexp);
            this.condition = parseCondition(condition);
            
        }
    }

    export class Option extends Node {
        @parsePositional("string") label:string;
        @parsePositional("SExp")   value:SExp;
    }

    export class Variant extends Node {
        // Almost clone of Game, except for optionality
        @parseNamedOptional("string")             title:        string;
        @parseNamedOptional("string")             description:  string;
        @parseNamedOptional("string")             history:      string;
        @parseNamedOptional("string")             strategy:     string;
        @parseNamedOptional("string*")            players:      string[];
        @parseNamedOptional("string*")            "turn-order":  string;
        @parseNamedOptional("BoardSetup")         "board-setup": BoardSetup;
        @parseNamedOptional("Board[]", "board")   boards: Board[];
        @parseNamedOptional("Piece[]", "piece")   pieces: Piece[];
        @parseNamedOptional("Option[]", "option") options: Option[];
        @parseNamedOptional("EndCondition[]", "draw-condition") "draw-conditions": EndCondition[];
        @parseNamedOptional("EndCondition[]", "win-condition") "win-conditions": EndCondition[];
    }

    export class Game extends Node {
        // Metadata for parser, field name, field type.
        @parseNamed("string")             title:        string;
        @parseNamedOptional("string")     description:  string;
        @parseNamedOptional("string")     music:        string;
        // Sound:
        @parseNamedOptional("string")     "opening-sound": string;
        @parseNamedOptional("string")     "win-sound": string;
        @parseNamedOptional("string")     "loss-sound": string;
        @parseNamedOptional("string")     "release-sound": string;
        @parseNamedOptional("string")     "capture-sound": string;
        @parseNamedOptional("string")     "move-sound": string;
        // TODO: Enum for pass-turn states:
        @parseNamedOptional("string")     "pass-turn": string;
        @parseNamedOptional("string")     history:      string;
        @parseNamedOptional("string")     strategy:     string;
        @parseNamed("string*")            players:      string[];
        @parseNamed("string*")            "turn-order":  string[];
        @parseNamed("BoardSetup")         "board-setup": BoardSetup;
        @parseNamed("Board")              board: Board[];
        @parseNamed("Piece[]", "piece")   pieces: Piece[];
        @parseNamedOptional("Option[]", "option") options: Option[];
        @parseNamedOptional("EndCondition[]", "draw-condition") "draw-conditions": EndCondition[];
        @parseNamedOptional("EndCondition[]", "win-condition")  "win-conditions":  EndCondition[];
        @parseNamedOptional("EndCondition[]", "loss-condition") "loss-conditions": EndCondition[];
    }

    export interface ZrfCompilerPass<T> {
        Node?(obj:Node): T;
        /* Autogenerated by reflection on this module */
        Attribute?(obj:Attribute): T;
        File?(obj:File): T;
        Directions?(obj:Directions): T;
        Dimensions?(obj:Dimensions): T;
        Piece?(obj:Piece): T;
        Drops?(obj:Drops): T;
        Moves?(obj:Moves): T;
        Grid?(obj:Grid): T;
        Symmetry?(obj:Symmetry): T;
        Board?(obj:Board): T;
        Zone?(obj:Zone): T;
        BoardSetup?(obj:BoardSetup): T;
        EndCondition?(obj:EndCondition): T;
        Option?(obj:Option): T;
        Variant?(obj:Variant): T;
        Game?(obj:Game): T;
        Condition?(obj:Condition): T;
        LiteralCondition?(obj:LiteralCondition): T;
        NotCondition?(obj:NotCondition): T;
        FlagCondition?(obj:FlagCondition): T;
        AndCondition?(obj:AndCondition): T;
        OrCondition?(obj:OrCondition): T;
        AdjacentToEnemyCondition?(obj:AdjacentToEnemyCondition): T;
        AttackedCondition?(obj:AttackedCondition): T;
        DefendedCondition?(obj:DefendedCondition): T;
        EmptyCondition?(obj:EmptyCondition): T;
        EnemyCondition?(obj:EnemyCondition): T;
        FriendCondition?(obj:FriendCondition): T;
        GoalPositionCondition?(obj:GoalPositionCondition): T;
        IncludesCondition?(obj:IncludesCondition): T;
        InZoneCondition?(obj:InZoneCondition): T;
        LastFromCondition?(obj:LastFromCondition): T;
        LastToCondition?(obj:LastToCondition): T;
        UnresolvedCondition?(obj:UnresolvedCondition): T;
        MarkedCondition?(obj:MarkedCondition): T;
        StalematedCondition?(obj:StalematedCondition): T;
        PiecesRemainingCondition?(obj:PiecesRemainingCondition): T;
        RepetitionCondition?(obj:RepetitionCondition): T;
        NeutralCondition?(obj:NeutralCondition): T;
        OnBoardCondition?(obj:OnBoardCondition): T;
        PieceCondition?(obj:PieceCondition): T;
        PositionCondition?(obj:PositionCondition): T;
        PositionFlagCondition?(obj:PositionFlagCondition): T;
        AbsoluteConfigCondition?(obj:AbsoluteConfigCondition): T;
        RelativeConfigCondition?(obj:RelativeConfigCondition): T;
        Statement?(obj:Statement): T;
        AddStatement?(obj:AddStatement): T;
        BackStatement?(obj:BackStatement): T;
        ElseStatement?(obj:ElseStatement): T;
        CascadeStatement?(obj:CascadeStatement): T;
        StepDirectionStatement?(obj:StepDirectionStatement): T;
        CaptureStatement?(obj:CaptureStatement): T;
        ChangeOwnerStatement?(obj:ChangeOwnerStatement): T;
        ChangeTypeStatement?(obj:ChangeTypeStatement): T;
        CreateStatement?(obj:CreateStatement): T;
        FlipStatement?(obj:FlipStatement): T;
        GoStatement?(obj:GoStatement): T;
        VerifyStatement?(obj:VerifyStatement): T;
        IfStatement?(obj:IfStatement): T;
        MarkStatement?(obj:MarkStatement): T;
        SetAttributeStatement?(obj:SetAttributeStatement): T;
        WhileStatement?(obj:WhileStatement): T;
        MoveTypeStatement?(obj:MoveTypeStatement): T;

    }
    
    ///////////////////////////////////////////////////////////////////////////////
    // Statement/condition nodes:
    //   - Once we enter a statement or condition node, everything within it is 
    //   a statement or condition node. Thus, we implement a separate parser scheme 
    //  from above.
    ///////////////////////////////////////////////////////////////////////////////
/*    adjacent-to-enemy? Is there a link from the position to a position with an enemy
    piece?
    attacked? [<movetype>] Is the position attacked by an enemy piece?
    defended? [<movetype>] Is the position defended by a friendly piece?
    empty? Is the position empty of pieces?
    enemy? Is there an enemy piece on the position?
    friend? Is there a friendly piece on the position?
    goal-position? Is this position in an absolute-config goal for any side? This
    includes positions in a zone used in an absolute-config goal.
    in-zone? <zone> Is this position in the given zone?
    last-from? Was the last move a move from this position?
    last-to? Was the last move a move to this position?
    marked? Is this the marked position?
    neutral? Is there a neutral piece on the position?
    on-board? Is this position defined? Use with a direction argument, i.e.
    (on-board? ne)
    piece? <piece-type> Is there a piece of this type on the position?
    position? <position> Is the current position the given position?
    position-flag? <flag-name> Is the given flag true for the current position?
    <attribute> Does a piece exist on the position that possesses the attribute?*/

        const NEGATOR = "not-";
        export function parseCondition(sexp:SExp|string):Condition{
            let getCondition = (keyword:string):Condition =>  {
                switch (keyword) {
                case "flag?": return new FlagCondition();
                case "not":   return new NotCondition();
                case "and":   return new AndCondition();
                case "or":    return new OrCondition();
                case "true":  return new LiteralCondition(true);
                case "false": return new LiteralCondition(false);
                case "adjacent-to-enemy": return new AdjacentToEnemyCondition();
                case "piece?": return new PieceCondition();
                case "attacked?": return new AttackedCondition();
                case "defended?": return new DefendedCondition();
                case "empty?": return new EmptyCondition();
                case "enemy?": return new EnemyCondition();
                case "friend?": return new FriendCondition();
                case "goal-position?": return new GoalPositionCondition();
                case "includes": return new IncludesCondition();
                case "in-zone?": return new InZoneCondition();
                case "last-from?": return new LastFromCondition();
                case "last-to?": return new LastToCondition();
                case "never-moved?": return new LastToCondition();
                case "marked?": return new MarkedCondition();
                case "neutral?": return new NeutralCondition();
                case "on-board?": return new OnBoardCondition();
                case "piece?": return new PieceCondition();
                case "position?": return new PositionCondition();
                case "position-flag?": return new PositionFlagCondition();
                case "absolute-config": return new AbsoluteConfigCondition();
                case "relative-config": return new RelativeConfigCondition();
                case "stalemated": return new StalematedCondition();
                case "pieces-remaining": return new PiecesRemainingCondition();
                case "repetition": return new RepetitionCondition();
                default:
                    return new UnresolvedCondition(keyword);
                }
            }
            // Account for 'not-':
            let getConditionHandlingNot = (keyword:string) => {
                let negated = (keyword.indexOf(NEGATOR) === 0);
                if (negated) keyword = keyword.substring(NEGATOR.length, keyword.length);
                let result = getCondition(keyword);
                result.negated = negated;
                return result;
            }

            if (typeof sexp === "string") {
                return getConditionHandlingNot(sexp);
            } else if (typeof sexp.head === "string") {
                var result = getConditionHandlingNot(<string>sexp.head);
                result.processSubnodes(sexp.tail);
                return result;
            }
            throw new Error("Sexp has wrong shape!" + JSON.stringify(sexp));
        }

        export function parseStatement(sexp:SExp|string):Statement{
            let getStatement = (keyword:string):Statement => {
                switch (keyword) {
                case "back":    return new BackStatement();
                case "else":    return new ElseStatement();
                case "cascade": return new CascadeStatement();
                case "add":              
                case "add-copy":         
                case "add-copy-partial": 
                case "add-partial":      
                case "add-copy-partial": 
                    return new AddStatement(keyword.indexOf("copy") > -1, keyword.indexOf("partial") > -1);
                case "capture":      return new CaptureStatement();
                case "change-owner": return new ChangeOwnerStatement();
                case "change-type":  return new ChangeTypeStatement();
                case "create":       return new CreateStatement();
                case "flip":         return new FlipStatement();
                case "go":           return new GoStatement();
                case "if":           return new IfStatement();
                case "mark":         return new MarkStatement();
                case "verify":       return new VerifyStatement();
                case "set-attribute":return new SetAttributeStatement();
                case "while":        return new WhileStatement();
                case "move-type":        return new MoveTypeStatement();
                default:             
                    return new StepDirectionStatement(keyword);
                }
            }

            if (typeof sexp === "string") {
                return getStatement(sexp);
            } else if (typeof sexp.head === "string") {
                let statement = getStatement(<string>sexp.head);
                statement.processSubnodes(sexp.tail);
                return statement;
            }
            throw new Error("No statement from " + JSON.stringify(sexp));
        }
       
        //
        // The condition types
        //

        export class Condition extends Node {
            negated:boolean = false;
        } 
        export class LiteralCondition extends Condition {
            constructor(public value:boolean) {
                super();
            }
        }
        export class NotCondition extends Condition {
            @parsePositional(parseCondition) condition: Condition;
        }
        
        export function parseConditionList(conditionsSexp: SExp): Condition[] {
            return sexpToList(conditionsSexp).map(parseCondition);
        }
        export class FlagCondition extends Condition {
            @parsePositional("string") flagName: string;
        }
        export class AndCondition extends Condition {
            @parseRest(parseConditionList) conditions: Condition[];
        }
        export class OrCondition extends Condition {
            @parseRest(parseConditionList) conditions: Condition[];
        }

        // Position-conditions
        export class AdjacentToEnemyCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class AttackedCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class DefendedCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class EmptyCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class EnemyCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class FriendCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class GoalPositionCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class IncludesCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class InZoneCondition extends Condition {
            @parsePositional("string") zoneId: string;
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class LastFromCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class LastToCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class UnresolvedCondition extends Condition {
            constructor(public condition:string) {
                super();
            }
        }
        export class MarkedCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class StalematedCondition extends Condition {
            @parsePositionalOptional("string") positionOrDirectionId: string;
        }
        export class PiecesRemainingCondition extends Condition {
            @parsePositional(parseInt) amountRemaining: number;
            @parsePositionalOptional("string") pieceId: string;
        }
        /* 3-fold repetition has occurred: */
        export class RepetitionCondition extends Condition {
        }
        export class NeutralCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class OnBoardCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class PieceCondition extends Condition {
            @parsePositional("string") pieceId: string;
        }
        export class PositionCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class PositionFlagCondition extends Condition {
            @parsePositional("string") positionOrDirectionId: string;
        }
        
        export class AbsoluteConfigCondition extends Condition {
            occupantAndPieceIds:string[][];
            processSubnodesWorker(sexp:SExp) {
                this.occupantAndPieceIds = sexpToList(sexp).map(sexpBoxIfString).map(sexpToStrings);
            }
        }
        
        export class RelativeConfigCondition extends Condition {
        }
        //
        // The statement types 
        // Some comments are snippets from the ZRF reference manual
        //
        export class Statement extends Node {} 
        
        
        //(add | add-copy | add-partial | add-copy-partial <position> | <direction>)
        export class AddStatement extends Statement {
            @parsePositional("string") positionOrDirectionId: string;
            constructor(public isCopy:boolean, public isPartial:boolean) {
                super();
            }
        } 
    
        // Simple (no-argument) statement types:
        export class BackStatement extends Statement {}
        export class ElseStatement extends Statement {}
        export class CascadeStatement extends Statement {}
        export class StepDirectionStatement extends Statement {
            constructor(public directionId: string) {
                super();
            }
        }
        
            // (change-owner <position> | <direction>)
            // (change-type <piece-type> [<position> | <direction>])
            //  (create [<player>] [<piece-type>] [<position> | <direction>])
            //  (flip <position> | <direction>)
            // (go from | to | last-from | last-to | mark)
            // (if <condition> <instruction> ... <instruction> [else <instruction> ... <instruction>])
            // (mark <position> | <direction>)
            
        // (capture <position> | <direction>)
        export class CaptureStatement extends Statement {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class ChangeOwnerStatement extends Statement {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class ChangeTypeStatement extends Statement {
            @parsePositional("string") pieceId: string;
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class CreateStatement extends Statement {
            @parsePositional("string") playerId: string;
            @parsePositional("string") pieceId: string;
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class FlipStatement extends Statement {
            @parsePositional("string") positionOrDirectionId: string;
        }
        export class GoStatement extends Statement {
            @parsePositional("string") where: string;
        }
        
        export function parseStatementList(statementsSexp: SExp): Statement[] {
            return sexpToList(statementsSexp).map(parseStatement);
        }
        
        export class VerifyStatement extends Statement {
            @parsePositional(parseCondition)     condition: Condition;
        }
        export class IfStatement extends Statement {
            condition: Condition;
            ifTrueStatements: Statement[] = [];
            ifFalseStatements: Statement[] = [];
            processSubnodesWorker(sexp:SExp) {
                this.condition = parseCondition(sexp.head);
                let sexps = sexpToList(sexp.tail);
                let container = this.ifTrueStatements;
                for (let sexp of sexps) {
                    if (sexp === "else") {
                        container = this.ifFalseStatements;
                    } else {
                        container.push(parseStatement(sexp))
                    }
                }
            }
        }
            
        export class MarkStatement extends Statement {
            @parsePositional("string") positionOrDirectionId: string;
        }

        export class SetAttributeStatement extends Statement {
            @parsePositional("string") attributeId: string;
            @parsePositional(parseCondition) value: Condition;
        }
        export class WhileStatement extends Statement {
            condition: Condition;
            statements: Statement[] = [];
            processSubnodesWorker(sexp:SExp) {
                this.condition = parseCondition(sexp.head);
                this.statements = parseStatementList(sexp.tail);
            }
        }
        export class MoveTypeStatement extends Statement {
            @parsePositional("string") moveTypeId: string;
        }
}

// Install class names into classes:
for (var key of Object.keys(zrfNodes)) {
    zrfNodes[key].prototype._classname = key;
}

// function zrfExpressionParse():zrfNodes.Expr {
//     
// }

type ParseInfo = {propertyKey: string, type:any}
function zrfChildParse(parent:zrfNodes.Node, childField:string, childValue:SExp, {propertyKey, type}:ParseInfo):void {
    // console.log({func: "_parseField", obj, field, type, value});

    var addData = (v:any) => {
        return parent[propertyKey] = v;
    };
    if (typeof type === "string" && type.substring(type.length - 2, type.length) === "[]") {
        type = type.substring(0, type.length - 2);
        addData = (v:any) => {
            parent[propertyKey] = parent[propertyKey] || [];
            return parent[propertyKey].push(v);
        };
    }

    if (childValue === null) {
        return console.log("**NOT FOUND: " + parent._classname + " " + childField);
    } // Handler function:
    else if (typeof type === 'function') {
        addData(type(childValue, parent));
    } else if (type === 'SExp') {
        addData(childValue);
    } else if (type === 'string') {
        // Simple atom (string):
        //assert.equal(value.length, 1)
        //assert.equal(typeof value[0], 'string')
        addData(sexpStringCast(childValue.head));
    } else if (type == 'string*') {
        // List of simple atoms (strings):
        //    assert.equal(typeof str, 'string')
        addData(sexpToStrings(childValue));
    } else if (type.substring(type.length-1,type.length) != '*') {
        var newNode = new zrfNodes[type]();
        newNode.processSubnodes(childValue);
        addData(newNode);
    } else {
        // List of ZRF nodes:
        type = type.substring(0, type.length - 1);
        addData(sexpToSexps(childValue).map(subNode => {
            var newNode = new zrfNodes[type]();
            newNode.processSubnodes(subNode);
            return newNode;
        }));
    }
}


export function _emitSampleCompilerPass() {
    console.log("var samplePass:zrf.ZrfCompilerPass<void> = {");
    for (var event of Object.keys(zrfNodes)) {
        if (event.substring(0, 1) == event.substring(0,1).toLowerCase()) continue; // TODO unuglify
        if (event === "Node") continue;
        var _class = zrfNodes[event];
        console.log(`    ${event}(obj:zrf.${event}) {`);
        for (var subevent of Object.keys(_class.prototype._subevents || {})) {
            var {propertyKey, type} = _class.prototype._subevents[subevent];
            if (propertyKey.indexOf("-") > -1) {
                propertyKey = `["${propertyKey}"]`;
            } else {
                propertyKey = `.${propertyKey}`;
            }
            var tStr = typeof type == "string" ? type : "<function>";
            console.log(`        obj${propertyKey}; // ${tStr}`)
        }
        console.log(`    },`);
    }
    console.log("}");
}

export function _emitCompilerPassInterface() {
    console.log("interface ZrfCompilerPass<T> {");
    for (var event of Object.keys(zrfNodes)) {
        if (event.substring(0, 1) == event.substring(0,1).toLowerCase()) continue; // TODO unuglify
        if (event === "Node") continue;
        console.log(`    ${event}?(obj:${event}): T;`)
    }
    console.log("}");
}
