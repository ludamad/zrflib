import * as state from "./stateTypes";

// The move descriptor interface

interface MoveDescriptor {
    end: state.GraphNode;
    start: state.GraphNode;
}

export interface MoveResolutionState {
    currentPos: state.GraphNode;
    game: state.GameState
}

export abstract class MoveNode {
    next:MoveNode = null;
    execNext(state: MoveResolutionState) {
        if (this.next) {
            this.next.exec(state);
        }
    }
    abstract exec(state: MoveResolutionState);
}

export class VerifyNode extends MoveNode {
    move:state.GraphNode;
    exec(state: MoveResolutionState) {
        state;
    }
}



class MoveResolver {
    constructor(gameState: state.GameState) {
        
    }
}

// (define add-to-empty  ((verify empty?) add) )
// (define step          ($1 (verify empty?) add) )