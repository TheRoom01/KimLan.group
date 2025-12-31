"use client";

import nextDynamic from "next/dynamic";

const HomeClient = nextDynamic(() => import("./HomeClient"), { ssr: false });

export default HomeClient;
