import {zrfNodes as zrf} from "./zrfTypes";
import * as stateTypes from "./stateTypes";
import {EnumerableMap, StrMap} from "./common/common";

function visitAll(node:zrf.Node, visitor:zrf.ZrfCompilerPass<void>) {
    function visit(obj:zrf.Node) {
        var handler = visitor[obj._classname];
        if (!handler) {
            if (obj instanceof zrf.Condition)
                handler = visitor.Condition || visitor.Node;
            else if (obj instanceof zrf.Statement)
                handler = visitor.Statement || visitor.Node;
            else 
                handler = visitor.Node;
        }
        if (handler) {
            handler(obj);
        }
        // TODO: can iterate obj._subevents, technically.
        for (let key of Object.keys(obj)) {
            if (Array.isArray(obj[key])) {
                for (let val of obj[key]) {
                    if (val instanceof zrf.Node) {
                        visit(val);
                    }
                }
            }
            else if (obj[key] instanceof zrf.Node) {
                visit(obj[key]);
            }
        }
    }
    visit(node);
}


// Data that is in the ZRF file but not present in the GameStateDescriptor:
export class GameStateComponents {
    constructor(public node:zrf.Game) {
    }
    rules = new stateTypes.GameStateDescriptor();
    idToPlayer : StrMap<stateTypes.Player> = {};
    idToPiece : StrMap<stateTypes.Piece> = {};
    idToGraphNode : StrMap<stateTypes.GraphNode> = {};
    idToDirection : StrMap<stateTypes.Direction> = {};
    playerMoves = new EnumerableMap<stateTypes.Player, zrf.Statement[][]>();
    playerDrops = new EnumerableMap<stateTypes.Player, zrf.Statement[][]>();
}

type PostFinalizeFunc = () => void;

// In the first compilation pass, we gather components of the GameStateDescriptor
function rulesCompileWorker(components:GameStateComponents, afterFinalize: (PostFinalizeFunc)=>void) : void {
    var {node, rules, idToDirection, idToPiece, idToGraphNode, idToPlayer, playerMoves, playerDrops} = components;
    var currentBoardZrf:zrf.Board = null;   
    var currentGrid:stateTypes.Grid = null;

    visitAll(node, {
        // obj === node, root of traversal:
        Game(obj:zrf.Game) {
            obj.title; // string
            obj.description; // string
            obj.history; // string
            obj.strategy; // string
            for (var playerName of obj.players) {
                idToPlayer[playerName] = rules.player(playerName)
            }
            rules.turnOrder = obj["turn-order"].map(name => idToPlayer[name]);
            obj["draw-conditions"]; // EndCondition[]
            obj["win-conditions"]; // EndCondition[]
            for (var key of Object.keys(obj.options || {})) {
                console.log("**NYI ${key}")
            }
        },
        Piece(obj:zrf.Piece) {
            var piece = idToPiece[obj.name] = rules.piece(obj.name);
            obj.help; // string
            for (var playerName of Object.keys(obj.images)) {
                piece.setImage(idToPlayer[playerName], obj.images[playerName]);
            }
            if (obj.moves) {
                playerMoves.set(piece, obj.moves.moves);
            }
            if (obj.drops) {
                playerDrops.set(piece, obj.drops.drops);
            }
        },
        Board(obj:zrf.Board) {
            currentBoardZrf = obj;
            // obj.image; // string
            // obj.grid; // Grid
        },
        Grid(obj:zrf.Grid) {
            var {xLabels, yLabels} = obj.dimensions;
            var grid = currentGrid = rules.grid(xLabels.length, yLabels.length, (x, y) => {
                return `${xLabels[x]}${yLabels[y]}`;
            });
            grid.setImage(currentBoardZrf.image);
            obj["start-rectangle"]; // <function>
            obj.directions; // Directions
        },
        Directions(obj:zrf.Directions) {
            for (var {name, dx, dy} of obj.dirs) {
                idToDirection[name] = rules.direction(currentGrid, dx, dy);
            }
        },
        BoardSetup(obj:zrf.BoardSetup) {
            afterFinalize(function() {
                for (var {player, pieces} of obj.components) {
                    for (var {piece, squares} of pieces) {
                        if (squares[0] === "off") {
                            var numberOfPieceInHand = parseInt(squares[1]);
                            console.log("*NYI", player, piece, "off", numberOfPieceInHand)
                        } else {
                            rules.boardSetup(idToPiece[piece], idToPlayer[player], squares);
                        }
                    }
                }
            });
        },
    });
}

export function rulesCompile(node:zrf.Game) : GameStateComponents {
    let components = new GameStateComponents(node);
    
    let postFinalizeFuncs:PostFinalizeFunc[] = [];
    let afterFinalize = (f) => postFinalizeFuncs.push(f);
    rulesCompileWorker(components, afterFinalize);
    components.rules.finalizeBoardShape();
    for (let postFinalizeFunc of postFinalizeFuncs) {
        postFinalizeFunc();
    }
    return components;
}
