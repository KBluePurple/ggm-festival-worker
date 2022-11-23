import { v4 as uuidv4 } from "uuid";

export interface Env {
    d1: D1Database;
}

async function handleGet(pathname: string, request: Request, d1: D1Database, ctx: ExecutionContext): Promise<Response> {
    switch (pathname) {
        case "/ggm-events":
            const events = await d1.prepare("SELECT * FROM Events WHERE current is 1").all();
            return new Response(JSON.stringify(events.results![0]));
        case "/rankings":
            const users = await d1.prepare("SELECT * FROM Users ORDER BY coins DESC").all();
            const rankings = users.results!.map((user: any, index) => {
                return {
                    rank: index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : index + 1,
                    name: user.username,
                    coins: user.coins
                };
            });
            return new Response(JSON.stringify(rankings));
        case "/products":
            const buyProducts = await d1.prepare("SELECT * FROM Products WHERE type is 0").all();
            const sellProducts = await d1.prepare("SELECT * FROM Products WHERE type is 1").all();
            const products = {
                buy: buyProducts.results!,
                sell: sellProducts.results!
            };
            return new Response(JSON.stringify(products));
        case "/user":
            const { results: userResults } = await d1.prepare("SELECT * FROM Users WHERE uuid is ?").bind(request.url!.split("?uuid=")[1]).all();
            if (userResults!.length === 0) {
                return new Response("유저를 찾을 수 없습니다", { status: 404 });
            }

            const user: any = userResults![0];
            const data = {
                uuid: user.uuid,
                username: user.username,
                coins: user.coins
            };
            return new Response(JSON.stringify(data));
        default:
            return new Response("Not found", { status: 404 });
    }
}

async function handlePost(pathname: string, request: Request, body: any, d1: D1Database, ctx: ExecutionContext): Promise<Response> {
    switch (pathname) {
        case "/register":
            const uuid = uuidv4();
            const token = uuidv4();

            const users = await d1.prepare("SELECT * FROM users").all();

            const { results } = await d1.prepare(
                "INSERT INTO Users (uuid, token, username, coins) VALUES (?, ?, ?, ?)")
                .bind(uuid, token, body.username, 0)
                .all();

            return new Response(JSON.stringify({
                uuid,
                token,
                username: body.username,
                coins: 0
            }));
        case "/give":
            console.log(body);
            const { results: managerResults } = await d1.prepare("SELECT * FROM Managers WHERE token is ?").bind(body.token).all();
            if (managerResults!.length === 0) {
                return new Response("권한 없음", { status: 401 });
            }

            // @ts-ignore
            const { results: managerUserResults } = await d1.prepare("SELECT * FROM Users WHERE token is ?").bind(managerResults![0].token).all();

            const { results: userResults } = await d1.prepare("SELECT * FROM Users WHERE uuid is ?").bind(body.uuid).all();
            if (userResults!.length === 0) {
                return new Response("유저를 찾을 수 없습니다", { status: 404 });
            }

            const user: any = userResults![0];
            const { results: updateUserResults } = await d1.prepare("UPDATE Users SET coins = ? WHERE uuid is ?").bind(user.coins + body.coins, user.uuid).all();
            // @ts-ignore
            const { results: logResults } = await d1.prepare('INSERT INTO TradeLogs (value, "from", "to", reason) VALUES (?, ?, ?, ?)').bind(body.coins, managerUserResults![0].uuid, user.uuid, body.reason).all();

            return new Response("성공");
        case "/take":
            console.log(body);
            const { results: managerResults2 } = await d1.prepare("SELECT * FROM Managers WHERE token is ?").bind(body.token).all();
            if (managerResults2!.length === 0) {
                return new Response("권한 없음", { status: 401 });
            }

            // @ts-ignore
            const { results: managerUserResults2 } = await d1.prepare("SELECT * FROM Users WHERE token is ?").bind(managerResults2![0].token).all();

            const { results: userResults2 } = await d1.prepare("SELECT * FROM Users WHERE uuid is ?").bind(body.uuid).all();
            if (userResults2!.length === 0) {
                return new Response("유저를 찾을 수 없습니다", { status: 404 });
            }

            const user2: any = userResults2![0];
            const { results: updateUserResults2 } = await d1.prepare("UPDATE Users SET coins = ? WHERE uuid is ?").bind(user2.coins - body.coins, user2.uuid).all();
            // @ts-ignore
            const { results: logResults2 } = await d1.prepare('INSERT INTO TradeLogs (value, "from", "to", reason) VALUES (?, ?, ?, ?)').bind(-body.coins, user2.uuid, managerUserResults2![0].uuid, body.reason).all();

            return new Response("성공");
    }

    return new Response("Not found", { status: 404 });
}

export default {
    fetch: async function(
        request: Request,
        env: Env,
        ctx: ExecutionContext
    ): Promise<Response> {
        let { pathname } = new URL(request.url);
        pathname = pathname.split("?")[0];
        const { d1 } = env;

        let response = new Response("Not found", { status: 404 });

        if (pathname === "/") {
            return new Response("GGM Festival API Endpoint");
        }

        if (pathname.startsWith("/api/")) {
            pathname = pathname.slice(4);
        } else {
            return new Response("Not Found", { status: 404 });
        }

        switch (request.method) {
            case "GET":
                response = await handleGet(pathname, request, d1, ctx);
                break;
            case "POST":
                const body: any = await request.json();
                response = await handlePost(pathname, request, body, d1, ctx);
                break;
            case "OPTIONS":
                response = new Response("", {
                    headers: {
                        "Access-Control-Allow-Origin": "*",
                        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                        "Access-Control-Allow-Headers": "Content-Type"
                    }
                });
                break;
        }

        response.headers.set("Content-Type", "application/json");
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        return response;
    }
};
