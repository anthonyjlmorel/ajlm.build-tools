import chalk from "chalk";

type TColor = "greenBright" | "green" | "redBright" | "red" | "yellow" | "gray" | "whiteBright";

export type TLoggerOptions = {
    color?: TColor;
};

/**
 * Simple Logger
 */
export class Logger {

    /**
     * Mapping log level to a color
     */
    private static colorMap: { [level: string]: TColor; } = {
        info: "greenBright",
        error: "redBright",
        warn: "yellow"
    };


    /**
     * Logs a message to a specified level 
     */
    public static log(msg: any, level: "info" | "error" | "warn", opts?: TLoggerOptions): void {
        // no message ?
        if(!msg){ return; }

        // default level
        level = level || "info";

        // if msg is not a string, make it one
        if(typeof msg != "string"){
            msg = JSON.stringify(msg);
        }

        // add timestamp
        msg = `${(new Date()).toISOString()}  ${msg}`;

        // add color
        let color: TColor = Logger.colorMap[ level ];

        // override color if specified
        if(opts && opts.color){
            color = opts.color;
        }
        
        console.log( chalk[color](msg) );
    }


    /**
     * Logs an error
     */
    public static error(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "error", opts);
    }


    /**
     * Logs a warning 
     */
    public static warn(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "warn", opts);
    }

    /**
     * Logs an information 
     */
    public static info(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "info", opts);
    }


}