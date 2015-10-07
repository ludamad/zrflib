import {GameStateDescriptor, Piece, GameState, GraphNode}  from "../stateTypes";

// More or less takes control of the game and UI logic.
export var rules = new GameStateDescriptor();

var whitePlayer = rules.player("white");
var blackPlayer = rules.player("black");

// Chess-like naming scheme:
var board = rules.grid(8, 8, (x, y) => `${String.fromCharCode(97 + x)}${1 + y}`);

var pawn:Piece = rules.piece("pawn");
pawn.setImage(whitePlayer, "images/Chess/wpawn_45x45.svg");
pawn.setImage(blackPlayer, "images/Chess/bpawn_45x45.svg");

rules.boardSetup(pawn, whitePlayer, "a1 b1 c1 d1 e1 f1 g1 h1".split(" "));
rules.boardSetup(pawn, whitePlayer, "a2 b2 c2 d2 e2 f2 g2 h2".split(" "));
rules.boardSetup(pawn, blackPlayer, "a7 b7 c7 d7 e7 f7 g7 h7".split(" "));
rules.boardSetup(pawn, blackPlayer, "a8 b8 c8 d8 e8 f8 g8 h8".split(" "));

var forwardLeft   = board.direction(-1, 1);
var forward       = board.direction(0, 1);
var forwardRight  = board.direction(1, 1);

var backwardLeft  = board.direction(-1, -1);
var backward      = board.direction(0, -1);
var backwardRight = board.direction(1, -1);

var MOVE_DIRECTIONS = [
    {
        white: forwardLeft,
        black: backwardLeft,
        canCapture: true
    }, {
        white: forward,
        black: backward,
        canCapture: false
    }, {
        white: forwardRight,
        black: backwardRight,
        canCapture: true
    }
];

function validCells(game:GameState, cell:GraphNode) {
    var player = game.currentPlayer();
    var cells = [];
    if (game.hasPiece(cell) != null && game.getPieceOwner(cell) === player) {
        for (var dir of MOVE_DIRECTIONS) {
            var next = cell.next(dir[player.id]);
            if (next == null) {
                // Invalid: Direction not defined here
                continue;
            }
            if (!game.hasPiece(next)) {
                // Valid: Direction defined and empty
                cells.push(next);
                continue;
            }
            if (game.getPieceOwner(next) === player) {
                // Invalid: Direction defined and friendly
                continue;
            }

            if (dir.canCapture) {
                // Valid: Direction defined and enemy and diagonal
                cells.push(next);
                continue;
            }
            // Invalid: Direction defined and enemy and forward
        }
    }
    return cells;
}


