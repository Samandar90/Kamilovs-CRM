"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const routes_1 = require("./routes");
const config_1 = require("./config");
const asyncHandler_1 = require("./middleware/asyncHandler");
const healthController_1 = require("./controllers/healthController");
const requestLogger_1 = require("./middleware/requestLogger");
const errorHandler_1 = require("./middleware/errorHandler");
const notFoundHandler_1 = require("./middleware/notFoundHandler");
const createApp = () => {
    const app = (0, express_1.default)();
    /** Корневые пути для health check без префикса /api (Render, Docker, ALB). */
    app.get("/health", healthController_1.livenessCheck);
    app.get("/health/ready", (0, asyncHandler_1.asyncHandler)(healthController_1.readinessCheck));
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            // Allow non-browser clients (no Origin) and configured web origins.
            if (!origin || config_1.config.corsOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    }));
    app.use(express_1.default.json());
    app.use(requestLogger_1.requestId);
    app.use(requestLogger_1.requestLogger);
    app.use("/api", routes_1.rootRouter);
    app.use(notFoundHandler_1.notFoundHandler);
    app.use(errorHandler_1.errorHandler);
    return app;
};
exports.createApp = createApp;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvYXBwLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9hcHAudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsc0RBQThCO0FBQzlCLGdEQUF3QjtBQUN4QixxQ0FBc0M7QUFDdEMscUNBQWtDO0FBQ2xDLDREQUF5RDtBQUN6RCxxRUFBK0U7QUFDL0UsOERBQXNFO0FBQ3RFLDREQUF5RDtBQUN6RCxrRUFBK0Q7QUFFeEQsTUFBTSxTQUFTLEdBQUcsR0FBRyxFQUFFO0lBQzVCLE1BQU0sR0FBRyxHQUFHLElBQUEsaUJBQU8sR0FBRSxDQUFDO0lBRXRCLDhFQUE4RTtJQUM5RSxHQUFHLENBQUMsR0FBRyxDQUFDLFNBQVMsRUFBRSxnQ0FBYSxDQUFDLENBQUM7SUFDbEMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxlQUFlLEVBQUUsSUFBQSwyQkFBWSxFQUFDLGlDQUFjLENBQUMsQ0FBQyxDQUFDO0lBRXZELEdBQUcsQ0FBQyxHQUFHLENBQ0wsSUFBQSxjQUFJLEVBQUM7UUFDSCxNQUFNLEVBQUUsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLEVBQUU7WUFDM0Isb0VBQW9FO1lBQ3BFLElBQUksQ0FBQyxNQUFNLElBQUksZUFBTSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDbkQsUUFBUSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztnQkFDckIsT0FBTztZQUNULENBQUM7WUFDRCxRQUFRLENBQUMsSUFBSSxLQUFLLENBQUMscUJBQXFCLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUM7UUFDRCxXQUFXLEVBQUUsSUFBSTtLQUNsQixDQUFDLENBQ0gsQ0FBQztJQUNGLEdBQUcsQ0FBQyxHQUFHLENBQUMsaUJBQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0lBQ3hCLEdBQUcsQ0FBQyxHQUFHLENBQUMseUJBQVMsQ0FBQyxDQUFDO0lBQ25CLEdBQUcsQ0FBQyxHQUFHLENBQUMsNkJBQWEsQ0FBQyxDQUFDO0lBRXZCLEdBQUcsQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFLG1CQUFVLENBQUMsQ0FBQztJQUU1QixHQUFHLENBQUMsR0FBRyxDQUFDLGlDQUFlLENBQUMsQ0FBQztJQUN6QixHQUFHLENBQUMsR0FBRyxDQUFDLDJCQUFZLENBQUMsQ0FBQztJQUV0QixPQUFPLEdBQUcsQ0FBQztBQUNiLENBQUMsQ0FBQztBQTlCVyxRQUFBLFNBQVMsYUE4QnBCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IGV4cHJlc3MgZnJvbSBcImV4cHJlc3NcIjtcclxuaW1wb3J0IGNvcnMgZnJvbSBcImNvcnNcIjtcclxuaW1wb3J0IHsgcm9vdFJvdXRlciB9IGZyb20gXCIuL3JvdXRlc1wiO1xyXG5pbXBvcnQgeyBjb25maWcgfSBmcm9tIFwiLi9jb25maWdcIjtcclxuaW1wb3J0IHsgYXN5bmNIYW5kbGVyIH0gZnJvbSBcIi4vbWlkZGxld2FyZS9hc3luY0hhbmRsZXJcIjtcclxuaW1wb3J0IHsgbGl2ZW5lc3NDaGVjaywgcmVhZGluZXNzQ2hlY2sgfSBmcm9tIFwiLi9jb250cm9sbGVycy9oZWFsdGhDb250cm9sbGVyXCI7XHJcbmltcG9ydCB7IHJlcXVlc3RMb2dnZXIsIHJlcXVlc3RJZCB9IGZyb20gXCIuL21pZGRsZXdhcmUvcmVxdWVzdExvZ2dlclwiO1xyXG5pbXBvcnQgeyBlcnJvckhhbmRsZXIgfSBmcm9tIFwiLi9taWRkbGV3YXJlL2Vycm9ySGFuZGxlclwiO1xyXG5pbXBvcnQgeyBub3RGb3VuZEhhbmRsZXIgfSBmcm9tIFwiLi9taWRkbGV3YXJlL25vdEZvdW5kSGFuZGxlclwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IGNyZWF0ZUFwcCA9ICgpID0+IHtcclxuICBjb25zdCBhcHAgPSBleHByZXNzKCk7XHJcblxyXG4gIC8qKiDQmtC+0YDQvdC10LLRi9C1INC/0YPRgtC4INC00LvRjyBoZWFsdGggY2hlY2sg0LHQtdC3INC/0YDQtdGE0LjQutGB0LAgL2FwaSAoUmVuZGVyLCBEb2NrZXIsIEFMQikuICovXHJcbiAgYXBwLmdldChcIi9oZWFsdGhcIiwgbGl2ZW5lc3NDaGVjayk7XHJcbiAgYXBwLmdldChcIi9oZWFsdGgvcmVhZHlcIiwgYXN5bmNIYW5kbGVyKHJlYWRpbmVzc0NoZWNrKSk7XHJcblxyXG4gIGFwcC51c2UoXHJcbiAgICBjb3JzKHtcclxuICAgICAgb3JpZ2luOiAob3JpZ2luLCBjYWxsYmFjaykgPT4ge1xyXG4gICAgICAgIC8vIEFsbG93IG5vbi1icm93c2VyIGNsaWVudHMgKG5vIE9yaWdpbikgYW5kIGNvbmZpZ3VyZWQgd2ViIG9yaWdpbnMuXHJcbiAgICAgICAgaWYgKCFvcmlnaW4gfHwgY29uZmlnLmNvcnNPcmlnaW5zLmluY2x1ZGVzKG9yaWdpbikpIHtcclxuICAgICAgICAgIGNhbGxiYWNrKG51bGwsIHRydWUpO1xyXG4gICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuICAgICAgICBjYWxsYmFjayhuZXcgRXJyb3IoXCJOb3QgYWxsb3dlZCBieSBDT1JTXCIpKTtcclxuICAgICAgfSxcclxuICAgICAgY3JlZGVudGlhbHM6IHRydWUsXHJcbiAgICB9KVxyXG4gICk7XHJcbiAgYXBwLnVzZShleHByZXNzLmpzb24oKSk7XHJcbiAgYXBwLnVzZShyZXF1ZXN0SWQpO1xyXG4gIGFwcC51c2UocmVxdWVzdExvZ2dlcik7XHJcblxyXG4gIGFwcC51c2UoXCIvYXBpXCIsIHJvb3RSb3V0ZXIpO1xyXG5cclxuICBhcHAudXNlKG5vdEZvdW5kSGFuZGxlcik7XHJcbiAgYXBwLnVzZShlcnJvckhhbmRsZXIpO1xyXG5cclxuICByZXR1cm4gYXBwO1xyXG59O1xyXG5cclxuIl19