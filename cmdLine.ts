
import {zrfNodes, _emitSampleCompilerPass, _emitCompilerPassInterface} from "./zrfTypes";
import {zrfCompile} from "./zrfCompiler";
import {zrfPrettyPrint} from "./zrfUtils";
import * as zrfQueries from "./zrfQueries";
import {rulesCompile} from "./rulesCompiler";

var SAMPLE_ZRF = ` 
; *** Tic-Tac-Toe
; *** Copyright 1998-2002 Zillions Development
; v.2.0

; You need to purchase Zillions of Games to load this rules file
; Visit the Zillions web site at http://www.zillions-of-games.com

(version "2.0")

(define add-to-empty  ((verify empty?) add) )
(define step          ($1 (verify empty?) add) )

(game
   (title "Tic-Tac-Toe")
   (description "TestDescription.")
   (strategy "TestStrategy.")
   (option "animate drops" false)
   (option "prevent flipping" 2)
   (win-sound "Audio\\Congrats.wav")
   (loss-sound "Audio\\YouLose.wav")
   (players X O)
   (turn-order X O)
   (board
        (image "images\\TicTacToe\\TTTbrd.bmp")
        (grid
            (start-rectangle 16 16 112 112) ; top-left position
            (dimensions ;3x3
                ("top-/middle-/bottom-" (0 112)) ; rows
                ("left/middle/right" (112 0))) ; columns
            (directions (n -1 0) (e 0 1) (nw -1 -1) (ne -1 1))
        )
   )
   (piece
        (name man)
		(help "Man: drops on any empty square")
		(image X "images\\TicTacToe\\TTTX.bmp"
		       O "images\\TicTacToe\\TTTO.bmp")
        (drops (add-to-empty))
   )
   (board-setup
        (X (man off 5))
        (O (man off 5))
   )

   (draw-condition (X O) stalemated)
   (win-condition (X O)
	  	(or (relative-config man n man n man)
            (relative-config man e man e man)
            (relative-config man ne man ne man)
            (relative-config man nw man nw man)
		)
	)
)`;

console.log("COMPILING RULES")
var rules = rulesCompile(zrfCompile(SAMPLE_ZRF).game);
console.log(rules)
console.log("/COMPILING RULES")