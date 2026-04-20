"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const errorHandler_1 = require("./errorHandler");
const jwt_1 = require("../utils/jwt");
const requireAuth = (req, _res, next) => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
        throw new errorHandler_1.ApiError(401, "Authorization token is required");
    }
    const token = header.slice("Bearer ".length).trim();
    if (!token) {
        throw new errorHandler_1.ApiError(401, "Authorization token is required");
    }
    try {
        const payload = (0, jwt_1.verifyAccessToken)(token);
        req.auth = payload;
        req.user = {
            ...payload,
            nurse_doctor_id: payload.nurseDoctorId ?? null,
        };
    }
    catch (_error) {
        throw new errorHandler_1.ApiError(401, "Invalid or expired token");
    }
    next();
};
exports.requireAuth = requireAuth;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvbWlkZGxld2FyZS9hdXRoTWlkZGxld2FyZS50cyIsInNvdXJjZXMiOlsiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvbWlkZGxld2FyZS9hdXRoTWlkZGxld2FyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSxpREFBMEM7QUFDMUMsc0NBQWlEO0FBRTFDLE1BQU0sV0FBVyxHQUFHLENBQUMsR0FBWSxFQUFFLElBQWMsRUFBRSxJQUFrQixFQUFFLEVBQUU7SUFDOUUsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxhQUFhLENBQUM7SUFDekMsSUFBSSxDQUFDLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztRQUM3QyxNQUFNLElBQUksdUJBQVEsQ0FBQyxHQUFHLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztJQUM3RCxDQUFDO0lBRUQsTUFBTSxLQUFLLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDcEQsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ1gsTUFBTSxJQUFJLHVCQUFRLENBQUMsR0FBRyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVELElBQUksQ0FBQztRQUNILE1BQU0sT0FBTyxHQUFHLElBQUEsdUJBQWlCLEVBQUMsS0FBSyxDQUFDLENBQUM7UUFDekMsR0FBRyxDQUFDLElBQUksR0FBRyxPQUFPLENBQUM7UUFDbkIsR0FBRyxDQUFDLElBQUksR0FBRztZQUNULEdBQUcsT0FBTztZQUNWLGVBQWUsRUFBRSxPQUFPLENBQUMsYUFBYSxJQUFJLElBQUk7U0FDL0MsQ0FBQztJQUNKLENBQUM7SUFBQyxPQUFPLE1BQU0sRUFBRSxDQUFDO1FBQ2hCLE1BQU0sSUFBSSx1QkFBUSxDQUFDLEdBQUcsRUFBRSwwQkFBMEIsQ0FBQyxDQUFDO0lBQ3RELENBQUM7SUFFRCxJQUFJLEVBQUUsQ0FBQztBQUNULENBQUMsQ0FBQztBQXZCVyxRQUFBLFdBQVcsZUF1QnRCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBOZXh0RnVuY3Rpb24sIFJlcXVlc3QsIFJlc3BvbnNlIH0gZnJvbSBcImV4cHJlc3NcIjtcclxuaW1wb3J0IHsgQXBpRXJyb3IgfSBmcm9tIFwiLi9lcnJvckhhbmRsZXJcIjtcclxuaW1wb3J0IHsgdmVyaWZ5QWNjZXNzVG9rZW4gfSBmcm9tIFwiLi4vdXRpbHMvand0XCI7XHJcblxyXG5leHBvcnQgY29uc3QgcmVxdWlyZUF1dGggPSAocmVxOiBSZXF1ZXN0LCBfcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XHJcbiAgY29uc3QgaGVhZGVyID0gcmVxLmhlYWRlcnMuYXV0aG9yaXphdGlvbjtcclxuICBpZiAoIWhlYWRlciB8fCAhaGVhZGVyLnN0YXJ0c1dpdGgoXCJCZWFyZXIgXCIpKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAxLCBcIkF1dGhvcml6YXRpb24gdG9rZW4gaXMgcmVxdWlyZWRcIik7XHJcbiAgfVxyXG5cclxuICBjb25zdCB0b2tlbiA9IGhlYWRlci5zbGljZShcIkJlYXJlciBcIi5sZW5ndGgpLnRyaW0oKTtcclxuICBpZiAoIXRva2VuKSB7XHJcbiAgICB0aHJvdyBuZXcgQXBpRXJyb3IoNDAxLCBcIkF1dGhvcml6YXRpb24gdG9rZW4gaXMgcmVxdWlyZWRcIik7XHJcbiAgfVxyXG5cclxuICB0cnkge1xyXG4gICAgY29uc3QgcGF5bG9hZCA9IHZlcmlmeUFjY2Vzc1Rva2VuKHRva2VuKTtcclxuICAgIHJlcS5hdXRoID0gcGF5bG9hZDtcclxuICAgIHJlcS51c2VyID0ge1xyXG4gICAgICAuLi5wYXlsb2FkLFxyXG4gICAgICBudXJzZV9kb2N0b3JfaWQ6IHBheWxvYWQubnVyc2VEb2N0b3JJZCA/PyBudWxsLFxyXG4gICAgfTtcclxuICB9IGNhdGNoIChfZXJyb3IpIHtcclxuICAgIHRocm93IG5ldyBBcGlFcnJvcig0MDEsIFwiSW52YWxpZCBvciBleHBpcmVkIHRva2VuXCIpO1xyXG4gIH1cclxuXHJcbiAgbmV4dCgpO1xyXG59O1xyXG4iXX0=