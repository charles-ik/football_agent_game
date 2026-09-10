"use client";
import {createContext,useContext,type ReactNode} from "react";
const Revision = createContext<number|undefined>(undefined);
export function GameRevision({revision,children}:{revision:number;children:ReactNode}) {return <Revision.Provider value={revision}>{children}</Revision.Provider>;}
export const useGameRevision = () => useContext(Revision);
