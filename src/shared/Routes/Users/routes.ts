import { RouterRoute } from "@shared/Services/Router";
//import LoginPage from "./Login"

import loadable from "loadable-components";




export const loadRoutes = (parent = ""): RouterRoute[] => {
    return [
        {
            path: `${parent}/users/login`,
            component: loadable(() => import("./Login/index"))
        },
        {
            path: `${parent}/login`,
            component: loadable(() => import("./Login/index"))
        }
    ]
}