"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("./loadEnv");
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const config_1 = require("./config");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const mockDatabase_1 = require("./repositories/mockDatabase");
const app = (0, app_1.createApp)();
const server = http_1.default.createServer(app);
const port = config_1.config.port;
if (env_1.env.dataProvider === "mock") {
    (0, mockDatabase_1.ensureMockSeedData)();
}
const start = async () => {
    if (env_1.env.dataProvider === "postgres") {
        const dbUrl = process.env.DATABASE_URL;
        if (env_1.env.isProduction) {
            const redacted = dbUrl ? `${dbUrl.slice(0, 10)}...${dbUrl.slice(-10)}` : "undefined";
            // eslint-disable-next-line no-console
            console.log("DB URL:", redacted);
        }
        else {
            // eslint-disable-next-line no-console
            console.log("DB URL:", dbUrl);
        }
        database_1.dbPool
            .query("SELECT 1 AS ok")
            .then(() => {
            // eslint-disable-next-line no-console
            console.log("[DB] SELECT 1 OK");
        })
            .catch((err) => {
            // eslint-disable-next-line no-console
            const payload = err instanceof Error
                ? { name: err.name, message: err.message, code: err.code }
                : { message: String(err) };
            console.warn("[DB] SELECT 1 FAILED:", JSON.stringify(payload));
        });
    }
    server.listen(port, () => {
        // eslint-disable-next-line no-console
        console.log("Server running on port", port);
    });
};
void start();
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvc2VydmVyLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9zZXJ2ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFBQSxxQkFBbUI7QUFDbkIsZ0RBQXdCO0FBQ3hCLCtCQUFrQztBQUNsQyxxQ0FBa0M7QUFDbEMsc0NBQW1DO0FBQ25DLGdEQUEyQztBQUMzQyw4REFBaUU7QUFFakUsTUFBTSxHQUFHLEdBQUcsSUFBQSxlQUFTLEdBQUUsQ0FBQztBQUN4QixNQUFNLE1BQU0sR0FBRyxjQUFJLENBQUMsWUFBWSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRXRDLE1BQU0sSUFBSSxHQUFHLGVBQU0sQ0FBQyxJQUFJLENBQUM7QUFDekIsSUFBSSxTQUFHLENBQUMsWUFBWSxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQ2hDLElBQUEsaUNBQWtCLEdBQUUsQ0FBQztBQUN2QixDQUFDO0FBRUQsTUFBTSxLQUFLLEdBQUcsS0FBSyxJQUFtQixFQUFFO0lBQ3RDLElBQUksU0FBRyxDQUFDLFlBQVksS0FBSyxVQUFVLEVBQUUsQ0FBQztRQUNwQyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztRQUN2QyxJQUFJLFNBQUcsQ0FBQyxZQUFZLEVBQUUsQ0FBQztZQUNyQixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLE1BQU0sS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQztZQUNyRixzQ0FBc0M7WUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDbkMsQ0FBQzthQUFNLENBQUM7WUFDTixzQ0FBc0M7WUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDaEMsQ0FBQztRQUVELGlCQUFNO2FBQ0gsS0FBSyxDQUFDLGdCQUFnQixDQUFDO2FBQ3ZCLElBQUksQ0FBQyxHQUFHLEVBQUU7WUFDVCxzQ0FBc0M7WUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO1FBQ2xDLENBQUMsQ0FBQzthQUNELEtBQUssQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQ2Isc0NBQXNDO1lBQ3RDLE1BQU0sT0FBTyxHQUFHLEdBQUcsWUFBWSxLQUFLO2dCQUNsQyxDQUFDLENBQUMsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBRSxJQUFJLEVBQUcsR0FBVyxDQUFDLElBQUksRUFBRTtnQkFDbkUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQzdCLE9BQU8sQ0FBQyxJQUFJLENBQUMsdUJBQXVCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ2pFLENBQUMsQ0FBQyxDQUFDO0lBQ1AsQ0FBQztJQUVELE1BQU0sQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLEdBQUcsRUFBRTtRQUN2QixzQ0FBc0M7UUFDdEMsT0FBTyxDQUFDLEdBQUcsQ0FBQyx3QkFBd0IsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUM5QyxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQztBQUVGLEtBQUssS0FBSyxFQUFFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgXCIuL2xvYWRFbnZcIjtcclxuaW1wb3J0IGh0dHAgZnJvbSBcImh0dHBcIjtcclxuaW1wb3J0IHsgY3JlYXRlQXBwIH0gZnJvbSBcIi4vYXBwXCI7XHJcbmltcG9ydCB7IGNvbmZpZyB9IGZyb20gXCIuL2NvbmZpZ1wiO1xyXG5pbXBvcnQgeyBlbnYgfSBmcm9tIFwiLi9jb25maWcvZW52XCI7XHJcbmltcG9ydCB7IGRiUG9vbCB9IGZyb20gXCIuL2NvbmZpZy9kYXRhYmFzZVwiO1xyXG5pbXBvcnQgeyBlbnN1cmVNb2NrU2VlZERhdGEgfSBmcm9tIFwiLi9yZXBvc2l0b3JpZXMvbW9ja0RhdGFiYXNlXCI7XHJcblxyXG5jb25zdCBhcHAgPSBjcmVhdGVBcHAoKTtcclxuY29uc3Qgc2VydmVyID0gaHR0cC5jcmVhdGVTZXJ2ZXIoYXBwKTtcclxuXHJcbmNvbnN0IHBvcnQgPSBjb25maWcucG9ydDtcclxuaWYgKGVudi5kYXRhUHJvdmlkZXIgPT09IFwibW9ja1wiKSB7XHJcbiAgZW5zdXJlTW9ja1NlZWREYXRhKCk7XHJcbn1cclxuXHJcbmNvbnN0IHN0YXJ0ID0gYXN5bmMgKCk6IFByb21pc2U8dm9pZD4gPT4ge1xyXG4gIGlmIChlbnYuZGF0YVByb3ZpZGVyID09PSBcInBvc3RncmVzXCIpIHtcclxuICAgIGNvbnN0IGRiVXJsID0gcHJvY2Vzcy5lbnYuREFUQUJBU0VfVVJMO1xyXG4gICAgaWYgKGVudi5pc1Byb2R1Y3Rpb24pIHtcclxuICAgICAgY29uc3QgcmVkYWN0ZWQgPSBkYlVybCA/IGAke2RiVXJsLnNsaWNlKDAsIDEwKX0uLi4ke2RiVXJsLnNsaWNlKC0xMCl9YCA6IFwidW5kZWZpbmVkXCI7XHJcbiAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXHJcbiAgICAgIGNvbnNvbGUubG9nKFwiREIgVVJMOlwiLCByZWRhY3RlZCk7XHJcbiAgICB9IGVsc2Uge1xyXG4gICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgICBjb25zb2xlLmxvZyhcIkRCIFVSTDpcIiwgZGJVcmwpO1xyXG4gICAgfVxyXG5cclxuICAgIGRiUG9vbFxyXG4gICAgICAucXVlcnkoXCJTRUxFQ1QgMSBBUyBva1wiKVxyXG4gICAgICAudGhlbigoKSA9PiB7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgICBjb25zb2xlLmxvZyhcIltEQl0gU0VMRUNUIDEgT0tcIik7XHJcbiAgICAgIH0pXHJcbiAgICAgIC5jYXRjaCgoZXJyKSA9PiB7XHJcbiAgICAgICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLWNvbnNvbGVcclxuICAgICAgICBjb25zdCBwYXlsb2FkID0gZXJyIGluc3RhbmNlb2YgRXJyb3JcclxuICAgICAgICAgID8geyBuYW1lOiBlcnIubmFtZSwgbWVzc2FnZTogZXJyLm1lc3NhZ2UsIGNvZGU6IChlcnIgYXMgYW55KS5jb2RlIH1cclxuICAgICAgICAgIDogeyBtZXNzYWdlOiBTdHJpbmcoZXJyKSB9O1xyXG4gICAgICAgIGNvbnNvbGUud2FybihcIltEQl0gU0VMRUNUIDEgRkFJTEVEOlwiLCBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSk7XHJcbiAgICAgIH0pO1xyXG4gIH1cclxuXHJcbiAgc2VydmVyLmxpc3Rlbihwb3J0LCAoKSA9PiB7XHJcbiAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxyXG4gICAgY29uc29sZS5sb2coXCJTZXJ2ZXIgcnVubmluZyBvbiBwb3J0XCIsIHBvcnQpO1xyXG4gIH0pO1xyXG59O1xyXG5cclxudm9pZCBzdGFydCgpO1xyXG5cclxuIl19