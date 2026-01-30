declare namespace IINA {
    interface IINAGlobal {
        postMessage: (name: string, payload: unknown) => void;
        onMessage: (name: string, handler: (payload: unknown) => void) => void;
    }
}
