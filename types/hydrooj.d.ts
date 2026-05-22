declare module 'hydrooj' {
  export type Context = any;
  export const db: any;
  export const definePlugin: <T = any>(args: {
    name?: string;
    apply: (ctx: Context, config: T) => void | Promise<void>;
    schema?: any;
    Config?: any;
    inject?: any;
  }) => any;
  export class Handler {
    args: Record<string, any>;
    ctx: any;
    domain: any;
    request: any;
    response: any;
    session: any;
    UiContext: any;
    user: any;
    back(args?: any): void;
    checkPerm(...args: bigint[]): void;
    checkPriv(...args: number[]): void;
    limitRate(op: string, periodSecs: number, maxOperations: number, defaultKey?: string): Promise<void>;
    translate(str: string): string;
    url(name: string, ...kwargsList: Record<string, any>[]): string;
  }
  export const Types: Record<string, any>;
  export function param(name: string, type: any, optional?: boolean): MethodDecorator;
  export function post(name: string, type: any, optional?: boolean): MethodDecorator;
  export const Schema: any;
  export const nanoid: () => string;
  export const PERM: Record<string, bigint>;
  export const PRIV: Record<string, number>;
  export const STATUS: Record<string, number>;
  export const STATUS_TEXTS: Record<number, string>;
  export const StorageModel: any;
  export const ProblemModel: any;
  export const RecordModel: any;
  export const DomainModel: any;
  export const ContestModel: any;
  export const JudgeResultCallbackContext: any;
  export class ValidationError extends Error {}
  export class ForbiddenError extends Error {}
  export class NotFoundError extends Error {}
  export class FileTooLargeError extends Error {}
}

