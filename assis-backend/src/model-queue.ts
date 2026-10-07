// Both preparation jobs and conversations share one local model slot.
let tail:Promise<unknown> = Promise.resolve();
export async function serialInference<T>(signal:AbortSignal, run:()=>Promise<T>):Promise<T> {
 const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);
 try {await previous;signal.throwIfAborted();return await run();} finally {release();}
}
