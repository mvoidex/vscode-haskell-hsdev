import * as fs from 'fs';

import { IConnection } from 'vscode-languageserver';

export enum LogLevel {
    TRACE = 0,
    DEBUG,
    INFO,
    WARN,
    ERROR,
    FATAL
}

export class Log {
    private static _instance: Log = null;
    private static _logFile: string | null = null; // "C:\\users\\voide\\vscode-hsdev.log";

    public static get instance(): Log {
        return Log._instance;
    }
    public static init(connection: IConnection, level: LogLevel = LogLevel.INFO) {
        if (Log._instance === null) {
            Log._instance = new Log(connection, level);
        }
        Log.instance.level = level;
    }

    private constructor(
        private connection: IConnection,
        public level: LogLevel = LogLevel.INFO
    ) {}

    public static log(lev: LogLevel, msg: string, args: any = null) {
        try {
            if (args !== null) {
                msg += ` ${JSON.stringify(args)}`;
            }
            if (Log.instance && lev >= Log.instance.level) {
                let text = `${LogLevel[lev]}: ${msg}`;
                if (Log._logFile) {
                    fs.appendFileSync(Log._logFile, text + '\n');
                }
                Log.instance.connection.console.log(text);
            }
        } catch (e) {}
    }

    public static trace(msg: string, args: any = null) {
        Log.log(LogLevel.TRACE, msg, args);
    }

    public static debug(msg: string, args: any = null) {
        Log.log(LogLevel.DEBUG, msg, args);
    }
    
    public static info(msg: string, args: any = null) {
        Log.log(LogLevel.INFO, msg, args);
    }
    
    public static warn(msg: string, args: any = null) {
        Log.log(LogLevel.WARN, msg, args);
    }
    
    public static error(msg: string, args: any = null) {
        Log.log(LogLevel.ERROR, msg, args);
    }
    
    public static fatal(msg: string, args: any = null) {
        Log.log(LogLevel.FATAL, msg, args);
    }
}

/**
 * Tools for debugging logs
 */
export class DebugUtils {
    private static _instance: DebugUtils = null;

    /**
     * Get the singleton
     */
    public static get instance(): DebugUtils {
        return DebugUtils._instance;
    }

    /**
     * Initializes the debug environment
     */
    public static init(isDebugOn: boolean, connection: IConnection) {
        if (DebugUtils._instance === null) {
            DebugUtils._instance = new DebugUtils(isDebugOn, connection);
        }
    }

    public isDebugOn: boolean;
    private connection: IConnection;

    private constructor(isDebugOn: boolean, connection: IConnection) {
        this.isDebugOn = isDebugOn;
        this.connection = connection;
    }

    /**
     * Does a connection.console.log call if debug mode is activated
     */
    public connectionLog(text: string) {
        if (this.isDebugOn) {
            this.connection.console.log(text);
        }
    }

    /**
     * Does a console.log call if debug mode is activated
     */
    public log(text: string) {
        if (this.isDebugOn) {
            console.log(text);
        }
    }
}


export function wrapCallback(name: string, fn: any) {
    return (...args: any[]) => {
        try {
            return fn(...args);
        } catch (e) {
            Log.warn(`Callback '${name}' result in exception: ${e}`);
        }
    };
}
