import chalk from "chalk";

type TColor = "greenBright" | "green" | "redBright" | "red" | "yellow" | "gray" | "whiteBright";

export type TLoggerOptions = {
    color?: TColor;
};


export class Logger {

    private static colorMap: { [level: string]: TColor; } = {
        info: "greenBright",
        error: "redBright",
        warn: "yellow"
    };


    public static log(msg: any, level: "info" | "error" | "warn", opts?: TLoggerOptions): void {

        if(typeof msg != "string"){
            msg = JSON.stringify(msg);
        }

        msg = `${(new Date()).toISOString()}  ${msg}`;

        let color: TColor = Logger.colorMap[ level ];

        if(opts && opts.color){
            color = opts.color;
        }
        
        console.log( chalk[color](msg) );
    }


    public static error(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "error", opts);
    }


    public static warn(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "warn", opts);
    }

    public static info(msg: any, opts?: TLoggerOptions): void {
        this.log(msg, "info", opts);
    }


}