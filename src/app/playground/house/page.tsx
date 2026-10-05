import { notFound } from "next/navigation";
import HouseEditor from "@/frontend/house/HouseEditor";
export default function HousePlayground(){if(process.env.NODE_ENV==="production")notFound();return <HouseEditor preview/>;}
