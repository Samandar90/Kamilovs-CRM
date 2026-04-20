"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notFoundHandler = void 0;
const env_1 = require("../config/env");
const notFoundHandler = (req, res, _next) => {
    if (env_1.env.isProduction) {
        return res.status(404).json({
            error: "Not found",
        });
    }
    return res.status(404).json({
        error: "Route not found",
        path: req.originalUrl,
    });
};
exports.notFoundHandler = notFoundHandler;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvbWlkZGxld2FyZS9ub3RGb3VuZEhhbmRsZXIudHMiLCJzb3VyY2VzIjpbIkM6L1VzZXJzL3VzZXIvRGVza3RvcC9jcm0gdjEuOC9zZXJ2aWNlcy9hcGkvc3JjL21pZGRsZXdhcmUvbm90Rm91bmRIYW5kbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLHVDQUFvQztBQUU3QixNQUFNLGVBQWUsR0FBRyxDQUFDLEdBQVksRUFBRSxHQUFhLEVBQUUsS0FBbUIsRUFBRSxFQUFFO0lBQ2xGLElBQUksU0FBRyxDQUFDLFlBQVksRUFBRSxDQUFDO1FBQ3JCLE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7WUFDMUIsS0FBSyxFQUFFLFdBQVc7U0FDbkIsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUNELE9BQU8sR0FBRyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDMUIsS0FBSyxFQUFFLGlCQUFpQjtRQUN4QixJQUFJLEVBQUUsR0FBRyxDQUFDLFdBQVc7S0FDdEIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyxDQUFDO0FBVlcsUUFBQSxlQUFlLG1CQVUxQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgUmVxdWVzdCwgUmVzcG9uc2UsIE5leHRGdW5jdGlvbiB9IGZyb20gXCJleHByZXNzXCI7XHJcbmltcG9ydCB7IGVudiB9IGZyb20gXCIuLi9jb25maWcvZW52XCI7XHJcblxyXG5leHBvcnQgY29uc3Qgbm90Rm91bmRIYW5kbGVyID0gKHJlcTogUmVxdWVzdCwgcmVzOiBSZXNwb25zZSwgX25leHQ6IE5leHRGdW5jdGlvbikgPT4ge1xyXG4gIGlmIChlbnYuaXNQcm9kdWN0aW9uKSB7XHJcbiAgICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xyXG4gICAgICBlcnJvcjogXCJOb3QgZm91bmRcIixcclxuICAgIH0pO1xyXG4gIH1cclxuICByZXR1cm4gcmVzLnN0YXR1cyg0MDQpLmpzb24oe1xyXG4gICAgZXJyb3I6IFwiUm91dGUgbm90IGZvdW5kXCIsXHJcbiAgICBwYXRoOiByZXEub3JpZ2luYWxVcmwsXHJcbiAgfSk7XHJcbn07XHJcblxyXG4iXX0=