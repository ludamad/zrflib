import {zrfNodes as zrf} from "./zrfTypes";
import * as stateTypes from "./stateTypes";
import {StrMap} from "./common/common";

function visitAll(node:zrf.Node, visitor:zrf.ZrfCompilerPass<void>) {
    function recurse(obj:zrf.Node) {
        // TODO: can iterate obj._subevents, technically.
        for (var key of Object.keys(obj)) {
            if (obj[key] instanceof zrf.Node) {
                var handler = visitor[obj[key]._classname];
                if (handler) {
                    handler(obj[key]);
                }
                recurse(obj[key]);
            }
        }
    }
    recurse(node);
}

export function rulesCompile(node:zrf.Game) : stateTypes.GameStateDescriptor {
    var rules = new stateTypes.GameStateDescriptor();
    var nameToPlayer : StrMap<stateTypes.Player> = {};
    var nameToPiece : StrMap<stateTypes.Piece> = {};
    var nameToDirection : StrMap<stateTypes.Direction> = {};
    var currentBoardZrf:zrf.Board = null;
    var currentGrid:stateTypes.Grid = null;
    var postFinalizeFunctions = [];

    visitAll(node, {
        // obj === node, root of traversal:
        Game(obj:zrf.Game) {
            obj.title; // string
            obj.description; // string
            obj.history; // string
            obj.strategy; // string
            for (var playerName of obj.players) {
                nameToPlayer[playerName] = rules.player(playerName)
            }
            obj["turn-order"]; // string*
            obj["board-setup"]; // string*
            obj.boards; // Board[]
            obj.pieces; // Piece[]
            obj["draw-conditions"]; // EndCondition[]
            obj["win-conditions"]; // EndCondition[]
            obj.options; // <function>
        },
        Piece(obj:zrf.Piece) {
            var piece = nameToPiece[obj.name] = rules.piece(obj.name);
            obj.help; // string
            for (var playerName of Object.keys(obj.images)) {
                piece.setImage(nameToPlayer[playerName], obj.images[playerName]);
            }
            obj.drops; // <function>
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
                nameToDirection[name] = rules.direction(currentGrid, dx, dy);
            }
        },
        BoardSetup(obj:zrf.BoardSetup) {
            postFinalizeFunctions.push(() => {
                for (var {player, pieces} of obj.components) {
                    for (var {piece, squares} of pieces) {
                        if (squares[0] === "off") {
                            var numberOfPieceInHand = parseInt(squares[1]);
                            console.log("*NYI", player, piece, "off", numberOfPieceInHand)
                        } else {
                            rules.boardSetup(nameToPiece[piece], nameToPlayer[player], squares);
                        }
                    }
                }
            });
        },
        EndCondition(obj:zrf.EndCondition) {
            // obj.players
        }
    });
    rules.finalizeBoardShape();
    for (var postFinalizeFunc of postFinalizeFunctions) {
        postFinalizeFunc();
    }
    return rules;
}

// 
// visitAll(node, {
//     Directions(obj:zrf.Directions) {
//         obj.dirs; // <function>
//     },
//     Dimensions(obj:zrf.Dimensions) {
//     },
//     Piece(obj:zrf.Piece) {
//         obj.name; // string
//         obj.help; // string
//         obj.images; // <function>
//         obj.drops; // <function>
//     },
//     Grid(obj:zrf.Grid) {
//         obj["start-rectangle"]; // <function>
//         obj.dimensions; // Dimensions
//         obj.directions; // Directions
//     },
//     Board(obj:zrf.Board) {
//         obj.image; // string
//         obj.grid; // Grid
//     },
//     BoardSetup(obj:zrf.BoardSetup) {
//     },
//     EndCondition(obj:zrf.EndCondition) {
//         // obj.players
//     },
//     Game(obj:zrf.Game) {
//         obj.title; // string
//         obj.description; // string
//         obj.history; // string
//         obj.strategy; // string
//         obj.players; // string*
//         obj["turn-order"]; // string*
//         obj["board-setup"]; // string*
//         obj.boards; // Board[]
//         obj.pieces; // Piece[]
//         obj["draw-conditions"]; // EndCondition[]
//         obj["win-conditions"]; // EndCondition[]
//         obj.option; // <function>
//     }
// });
