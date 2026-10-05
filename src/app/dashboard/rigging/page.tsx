import type { Metadata } from "next";
import RigEditor from "@/frontend/rigging/RigEditor";
export const metadata: Metadata={title:"2D / 3D Rigging — Atrion"};
export default function RiggingPage(){return <RigEditor/>;}
