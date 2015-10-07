/// <reference path="../DefinitelyTyped/react/react.d.ts" />
/// <reference path="../DefinitelyTyped/node/node.d.ts" />
declare var require;

// Sets up console.log without noisy logging messages:
import * as fs from "fs";
import * as React from "react";
import {zrfNodes as zrf} from "./zrflib/zrfTypes";
import * as stateTypes from "./zrflib/stateTypes";

import {playGame} from "./zrflib/cmdLine";
import {zrfCompile} from "./zrflib/zrfCompiler";
import {zrfPrettyPrint} from "./zrflib/zrfUtils";
import {GraphNode, Player, Piece, Graph, Stack, Direction, PieceInfo, GameState} from "./zrflib/stateTypes";
import {ZrfInterpreter, MoveList, MoveComponent, CompoundMove, doMove} from "./zrflib/moveGenerator";
import {GameStateComponents, rulesCompile} from "./zrflib/rulesCompiler";
import {getCorrectedBmpImage} from "./bmpGreenTransparencyHack";

let Draggable = require("./libs/react-draggable.js");

// Imports:

var _CSS = {
    alpha: "alpha-d2270",
    black: "black-3c85d",
    board: "board-b72b1",
    chessboard: "chessboard-63f37",
    clearfix: "clearfix-7da63",
    highlight1: "highlight1-32417",
    highlight2: "highlight2-9c5d2",
    notation: "notation-322f9",
    numeric: "numeric-fc462",
    piece: "piece-417db",
    row: "row-5277c",
    sparePieces: "spare-pieces-7492f",
    sparePiecesBottom: "spare-pieces-bottom-ae20f",
    sparePiecesTop: "spare-pieces-top-4028b",
    square: "square-55d63",
    white: "white-1e1d7"
};

var FOLDER_BASE = "./zrflib/zillions-zrf/Breakthrough/";

var cfg = {
    showNotation: true
};

class CorrectedImage extends React.Component<{src:string},{}> {
    render() {
        return <canvas ref="image" style={{
            "marginLeft": "auto",
            "marginRight": "auto"} as any}/>;
    }    
    componentDidMount() {
        let node = React.findDOMNode(this.refs["image"]);
        getCorrectedBmpImage(node, this.props.src);
    }
    componentDidUpdate() { 
        this.componentDidMount();
    }
}

class GamePiece extends React.Component<{
    piece:stateTypes.Piece,
    player:stateTypes.Player,
    gameState:stateTypes.GameState
},{}> {
    handleStart() {
        
    }
    render() {
        return <Draggable
            start={{x: 0, y: 0}}
            moveOnStartChange={false}
            // grid={[48, 48]}
            zIndex={-1000}
            onStart={this.handleStart}
            onDrag={this.handleStart}
            onStop={this.handleStart}>
                <div><CorrectedImage src={FOLDER_BASE + this.props.piece.images[this.props.player.id]}/>
                </div>
        </Draggable>;
    }
}

class GameGraphNode extends React.Component<{
    graphNode:stateTypes.GraphNode,
    width: number, height: number,
    gameState:stateTypes.GameState
},{
}> {
    render() {
        let piece = this.props.gameState.getPiece(this.props.graphNode);
        let divContents = [];
        if (piece) {
            divContents.push(<GamePiece 
                piece={piece} 
                gameState={this.props.gameState}
                player={this.props.gameState.getPieceOwner(this.props.graphNode)}
            />);
        }
        return <div className={`${_CSS.square}`} style={{textAlign: "center", height: this.props.height +"px", width: this.props.width +"px"} as any}>
            {divContents}
        </div>;
    }
}

class GameGrid extends React.Component<{
    grid:stateTypes.Grid,
    zrfGrid:zrf.Grid,
    cellWidth: number, cellHeight:number,
    gameState:stateTypes.GameState;
},{
}> {
    render() {
        let {grid, zrfGrid, cellWidth, cellHeight} = this.props;
        let rows = [];
        for (let y = 0; y < grid.height; y++) {
            let rowContents = [];
            for (let x = 0; x < grid.width; x++) {
                let cell = this.props.grid.getByXY(x, y);
                rowContents.push(<GameGraphNode
                    graphNode={cell} 
                    width={cellWidth} height={cellHeight}
                    gameState={this.props.gameState}
                />);
            }
            rowContents.push(<div key="clearfix" className={_CSS.clearfix}/>);
            rows.push(<div key={y} className={_CSS.row}> {rowContents} </div>);
        }
        return <div style={{width: cellWidth * grid.width, height: cellHeight * grid.height} as any}> {rows} </div>;
        // return <div className={_CSS.board}> {rows} </div>;
    }
}


function lowercaseLastPathComponent(str:string):string {
    let parts = str.split("/");
    parts[parts.length - 1] = parts[parts.length - 1].toLowerCase();
    return parts.join("/");
}

class GameBoard extends React.Component<{
    zrfBoard:zrf.Board,
    gameState:stateTypes.GameState;
},{
}> {
    render() {
        let {zrfBoard, gameState} = this.props;
        let grids = gameState.gameStateDesc.getGrids();
        let url = lowercaseLastPathComponent(FOLDER_BASE+zrfBoard.image);
        
        let {x1,y1,x2,y2} = zrfBoard.grid["start-rectangle"];
        let cellWidth = (x2 - x1), cellHeight = (y2 - y1);
        let totalWidth = grids[0].width * cellWidth +cellWidth, totalHeight = grids[0].height * cellHeight + cellHeight;
        return <div style={{backgroundRepeat: 'no-repeat', backgroundImage: `url('${url}')`, width: `${totalWidth}px`, height:`${totalHeight}px`} as any}> 
        <div style={{borderLeft: `${x1}px solid transparent`, borderTop: `${y1}px solid transparent`} as any}> {
            grids.map(
                /* TODO Actually support more than one grid ^_^*/
                grid => <GameGrid gameState={gameState} cellWidth={cellWidth} cellHeight={cellHeight} grid={grid} zrfGrid={zrfBoard.grid}/>
            )
        } </div> </div>;
    }
}

let game = playGame("./zrflib/zillions-zrf/Breakthrough/Breakthrough.zrf");
class GameBoardWatcher extends React.Component <{},{gameStateComponents:GameStateComponents, gameState:GameState}> {
    render() {
        if (!this.state) return <div/>
        let {gameStateComponents, gameState} = this.state;
        if (!gameStateComponents || !gameState) return <div/>; 
        let onClick = () => {
            game.playMove();
            this.forceUpdate();
        };
        return <div /*onClick={onClick}*/>
            <GameBoard zrfBoard={gameStateComponents.node.board} gameState={gameState}/>
        </div>;
    }
    componentDidMount() {
        this.setState({gameState: game.gameState, gameStateComponents: game.gameStateComp});
    }
}

window.onerror = function (message, file, line, column, errorObj) {
    if(errorObj !== undefined) //so it won't blow up in the rest of the browsers
        console.log('Error: ' + (errorObj as any).stack);
}


// var zrfNode = zrfCompile(fs.readFileSync("./zrflib/zillions-zrf/Breakthrough/Breakthrough.zrf", "utf8"));

let watcher = <GameBoardWatcher/>;
// React.render(<GameBoard gameState={gameState} zrfBoard={zrfNode.game.board} /> as any, document.getElementById("content") as any);
React.render(watcher as any, document.getElementById("content") as any);