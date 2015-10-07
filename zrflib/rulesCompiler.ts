import {zrfNodes as zrf} from "./zrfTypes";
import * as stateTypes from "./stateTypes";
import {EnumerableMap, StrMap, arrayWithValueNTimes} from "./common/common";

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


// Zone's are just static data, they dont need to be modelled as StateComponent's:
export class Zone {
    // Holds flags for each player:
    _membershipData:number[];
    constructor(nCells) {
        this._membershipData = arrayWithValueNTimes(nCells, 0);
    } 
    inZone(player:stateTypes.Player, cell:stateTypes.GraphNode):boolean {
        return !!(this._membershipData[cell.enumId] & (1 << player.enumId));
    }
    _setForPlayer(player:stateTypes.Player, cell:stateTypes.GraphNode) {
        this._membershipData[cell.enumId] |= (1 << player.enumId);
    }
}

// Data that is in the ZRF file but not present in the GameStateDescriptor:
export class GameStateComponents {
    constructor(public node:zrf.Game, public variant:zrf.Variant) {
    }
    rules = new stateTypes.GameStateDescriptor();
    idToPlayer : StrMap<stateTypes.Player> = {};
    idToPiece : StrMap<stateTypes.Piece> = {};
    idToGraphNode : StrMap<stateTypes.GraphNode> = {};
    idToDirection : StrMap<stateTypes.Direction> = {};
    idToZone : StrMap<Zone> = {};
    pieceAttributes = new EnumerableMap<stateTypes.Piece, StrMap<stateTypes.Attribute>>();
    
    pieceMoves = new EnumerableMap<stateTypes.Piece, zrf.Statement[][]>();
    pieceDrops = new EnumerableMap<stateTypes.Piece, zrf.Statement[][]>();
}

type PostFinalizeFunc = () => void;

// In the first compilation pass, we gather components of the GameStateDescriptor
function rulesCompileWorker(components:GameStateComponents, afterFinalize: (PostFinalizeFunc)=>void) : void {
    var {node, rules, idToDirection, idToPiece, idToGraphNode, idToPlayer, idToZone, pieceMoves, pieceDrops, pieceAttributes} = components;
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
                console.log(`**NYI: "${obj.options[key].label}" option`)
            }
        },
        Symmetry(obj:zrf.Symmetry) {
            // Delay until all directions collected for sure:
            afterFinalize(() => {
                let player:stateTypes.Player = idToPlayer[obj.playerId];
                for (let [fromDir, toDir] of obj.directionPairs) {
                    idToDirection[fromDir].setSymmetry(player, idToDirection[toDir]);
                }
            });
        },
        Piece(obj:zrf.Piece) {
            let attributes: StrMap<stateTypes.Attribute> = {};
            var piece = idToPiece[obj.name] = rules.piece(obj.name);
            pieceAttributes.set(piece, attributes);
            obj.help; // string
            if (typeof obj.attributes !== "undefined") {
                for (let {name, initialValue} of obj.attributes) {
                    console.log("WEE", name, initialValue)
                    attributes[name] = piece.attribute(name, (initialValue === "true"));
                }
            }
            // Delay until all players collected for sure:
            afterFinalize(() => {
                for (var playerName of Object.keys(obj.images)) {
                    console.log(playerName, idToPlayer[playerName])
                    piece.setImage(idToPlayer[playerName], obj.images[playerName]);
                }
            });
            if (obj.moves) {
                pieceMoves.set(piece, obj.moves.moves);
            }
            if (obj.drops) {
                pieceDrops.set(piece, obj.drops.drops);
            }
        },
        Board(obj:zrf.Board) {
            currentBoardZrf = obj;
            // obj.image; // string
            // obj.grid; // Grid
        },
        Zone(obj:zrf.Zone) {
            afterFinalize(() => {
                let nCells = Object.keys(idToGraphNode).length;
                let zone = idToZone[obj.name] || (idToZone[obj.name] = new Zone(nCells));
                for (let player of obj.players) {
                    for (let position of obj.positions) {
                                                console.log(player, position)
                        zone._setForPlayer(idToPlayer[player], idToGraphNode[position]);
                    }
                }
            });
        },
        Grid(obj:zrf.Grid) {
            var {xLabels, yLabels} = obj.dimensions;
            var grid = currentGrid = rules.grid(xLabels.length, yLabels.length, (x, y) => {
                return `${xLabels[x]}${yLabels[y]}`;
            });
            for (let cell of grid.cellList()) {
                idToGraphNode[cell.id] = cell;
            }
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


export function checkForUnknownSymbols(baseGame:zrf.Game, variant:zrf.Variant) {
    for (let node of [baseGame, variant]) {
        
    }
}

export function rulesCompile(baseGame:zrf.Game, variant:zrf.Variant) : GameStateComponents {
    let components = new GameStateComponents(baseGame, variant);
    
    let postFinalizeFuncs:PostFinalizeFunc[] = [];
    let afterFinalize = (f) => postFinalizeFuncs.push(f);
    rulesCompileWorker(components, afterFinalize);
    components.rules.finalizeBoardShape();
    for (let postFinalizeFunc of postFinalizeFuncs) {
        postFinalizeFunc();
    }
    return components;
}
