"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAccessToken = exports.signAccessToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const EXPIRES_IN = "8h";
const signAccessToken = (payload) => {
    return jsonwebtoken_1.default.sign(payload, env_1.env.jwtSecret, { expiresIn: EXPIRES_IN });
};
exports.signAccessToken = signAccessToken;
const verifyAccessToken = (token) => {
    const decoded = jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    if (!decoded || typeof decoded !== "object") {
        throw new Error("Invalid token payload");
    }
    const payload = decoded;
    if (typeof payload.userId !== "number" ||
        typeof payload.username !== "string" ||
        typeof payload.role !== "string") {
        throw new Error("Token payload shape is invalid");
    }
    if (payload.doctorId !== undefined &&
        payload.doctorId !== null &&
        typeof payload.doctorId !== "number") {
        throw new Error("Invalid token payload");
    }
    if (payload.nurseDoctorId !== undefined &&
        payload.nurseDoctorId !== null &&
        typeof payload.nurseDoctorId !== "number") {
        throw new Error("Invalid token payload");
    }
    const doctorId = payload.doctorId;
    const nurseDoctorId = payload.nurseDoctorId;
    return {
        userId: payload.userId,
        username: payload.username,
        role: payload.role,
        ...(doctorId !== undefined ? { doctorId } : {}),
        ...(nurseDoctorId !== undefined ? { nurseDoctorId } : {}),
    };
};
exports.verifyAccessToken = verifyAccessToken;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvdXRpbHMvand0LnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy91dGlscy9qd3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsZ0VBQStCO0FBQy9CLHVDQUFvQztBQUdwQyxNQUFNLFVBQVUsR0FBRyxJQUFJLENBQUM7QUFFakIsTUFBTSxlQUFlLEdBQUcsQ0FBQyxPQUF5QixFQUFVLEVBQUU7SUFDbkUsT0FBTyxzQkFBRyxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsU0FBRyxDQUFDLFNBQVMsRUFBRSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxDQUFDO0FBQ3JFLENBQUMsQ0FBQztBQUZXLFFBQUEsZUFBZSxtQkFFMUI7QUFFSyxNQUFNLGlCQUFpQixHQUFHLENBQUMsS0FBYSxFQUFvQixFQUFFO0lBQ25FLE1BQU0sT0FBTyxHQUFHLHNCQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRSxTQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDakQsSUFBSSxDQUFDLE9BQU8sSUFBSSxPQUFPLE9BQU8sS0FBSyxRQUFRLEVBQUUsQ0FBQztRQUM1QyxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUNELE1BQU0sT0FBTyxHQUFHLE9BQW9DLENBQUM7SUFDckQsSUFDRSxPQUFPLE9BQU8sQ0FBQyxNQUFNLEtBQUssUUFBUTtRQUNsQyxPQUFPLE9BQU8sQ0FBQyxRQUFRLEtBQUssUUFBUTtRQUNwQyxPQUFPLE9BQU8sQ0FBQyxJQUFJLEtBQUssUUFBUSxFQUNoQyxDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxnQ0FBZ0MsQ0FBQyxDQUFDO0lBQ3BELENBQUM7SUFDRCxJQUNFLE9BQU8sQ0FBQyxRQUFRLEtBQUssU0FBUztRQUM5QixPQUFPLENBQUMsUUFBUSxLQUFLLElBQUk7UUFDekIsT0FBTyxPQUFPLENBQUMsUUFBUSxLQUFLLFFBQVEsRUFDcEMsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsdUJBQXVCLENBQUMsQ0FBQztJQUMzQyxDQUFDO0lBQ0QsSUFDRSxPQUFPLENBQUMsYUFBYSxLQUFLLFNBQVM7UUFDbkMsT0FBTyxDQUFDLGFBQWEsS0FBSyxJQUFJO1FBQzlCLE9BQU8sT0FBTyxDQUFDLGFBQWEsS0FBSyxRQUFRLEVBQ3pDLENBQUM7UUFDRCxNQUFNLElBQUksS0FBSyxDQUFDLHVCQUF1QixDQUFDLENBQUM7SUFDM0MsQ0FBQztJQUNELE1BQU0sUUFBUSxHQUFHLE9BQU8sQ0FBQyxRQUFxQyxDQUFDO0lBQy9ELE1BQU0sYUFBYSxHQUFHLE9BQU8sQ0FBQyxhQUEwQyxDQUFDO0lBRXpFLE9BQU87UUFDTCxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU07UUFDdEIsUUFBUSxFQUFFLE9BQU8sQ0FBQyxRQUFRO1FBQzFCLElBQUksRUFBRSxPQUFPLENBQUMsSUFBZ0M7UUFDOUMsR0FBRyxDQUFDLFFBQVEsS0FBSyxTQUFTLENBQUMsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztRQUMvQyxHQUFHLENBQUMsYUFBYSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxhQUFhLEVBQUUsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDO0tBQzFELENBQUM7QUFDSixDQUFDLENBQUM7QUFyQ1csUUFBQSxpQkFBaUIscUJBcUM1QiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBqd3QgZnJvbSBcImpzb253ZWJ0b2tlblwiO1xyXG5pbXBvcnQgeyBlbnYgfSBmcm9tIFwiLi4vY29uZmlnL2VudlwiO1xyXG5pbXBvcnQgdHlwZSB7IEF1dGhUb2tlblBheWxvYWQgfSBmcm9tIFwiLi4vcmVwb3NpdG9yaWVzL2ludGVyZmFjZXMvdXNlclR5cGVzXCI7XHJcblxyXG5jb25zdCBFWFBJUkVTX0lOID0gXCI4aFwiO1xyXG5cclxuZXhwb3J0IGNvbnN0IHNpZ25BY2Nlc3NUb2tlbiA9IChwYXlsb2FkOiBBdXRoVG9rZW5QYXlsb2FkKTogc3RyaW5nID0+IHtcclxuICByZXR1cm4gand0LnNpZ24ocGF5bG9hZCwgZW52Lmp3dFNlY3JldCwgeyBleHBpcmVzSW46IEVYUElSRVNfSU4gfSk7XHJcbn07XHJcblxyXG5leHBvcnQgY29uc3QgdmVyaWZ5QWNjZXNzVG9rZW4gPSAodG9rZW46IHN0cmluZyk6IEF1dGhUb2tlblBheWxvYWQgPT4ge1xyXG4gIGNvbnN0IGRlY29kZWQgPSBqd3QudmVyaWZ5KHRva2VuLCBlbnYuand0U2VjcmV0KTtcclxuICBpZiAoIWRlY29kZWQgfHwgdHlwZW9mIGRlY29kZWQgIT09IFwib2JqZWN0XCIpIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdG9rZW4gcGF5bG9hZFwiKTtcclxuICB9XHJcbiAgY29uc3QgcGF5bG9hZCA9IGRlY29kZWQgYXMgUGFydGlhbDxBdXRoVG9rZW5QYXlsb2FkPjtcclxuICBpZiAoXHJcbiAgICB0eXBlb2YgcGF5bG9hZC51c2VySWQgIT09IFwibnVtYmVyXCIgfHxcclxuICAgIHR5cGVvZiBwYXlsb2FkLnVzZXJuYW1lICE9PSBcInN0cmluZ1wiIHx8XHJcbiAgICB0eXBlb2YgcGF5bG9hZC5yb2xlICE9PSBcInN0cmluZ1wiXHJcbiAgKSB7XHJcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJUb2tlbiBwYXlsb2FkIHNoYXBlIGlzIGludmFsaWRcIik7XHJcbiAgfVxyXG4gIGlmIChcclxuICAgIHBheWxvYWQuZG9jdG9ySWQgIT09IHVuZGVmaW5lZCAmJlxyXG4gICAgcGF5bG9hZC5kb2N0b3JJZCAhPT0gbnVsbCAmJlxyXG4gICAgdHlwZW9mIHBheWxvYWQuZG9jdG9ySWQgIT09IFwibnVtYmVyXCJcclxuICApIHtcclxuICAgIHRocm93IG5ldyBFcnJvcihcIkludmFsaWQgdG9rZW4gcGF5bG9hZFwiKTtcclxuICB9XHJcbiAgaWYgKFxyXG4gICAgcGF5bG9hZC5udXJzZURvY3RvcklkICE9PSB1bmRlZmluZWQgJiZcclxuICAgIHBheWxvYWQubnVyc2VEb2N0b3JJZCAhPT0gbnVsbCAmJlxyXG4gICAgdHlwZW9mIHBheWxvYWQubnVyc2VEb2N0b3JJZCAhPT0gXCJudW1iZXJcIlxyXG4gICkge1xyXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiSW52YWxpZCB0b2tlbiBwYXlsb2FkXCIpO1xyXG4gIH1cclxuICBjb25zdCBkb2N0b3JJZCA9IHBheWxvYWQuZG9jdG9ySWQgYXMgbnVtYmVyIHwgbnVsbCB8IHVuZGVmaW5lZDtcclxuICBjb25zdCBudXJzZURvY3RvcklkID0gcGF5bG9hZC5udXJzZURvY3RvcklkIGFzIG51bWJlciB8IG51bGwgfCB1bmRlZmluZWQ7XHJcblxyXG4gIHJldHVybiB7XHJcbiAgICB1c2VySWQ6IHBheWxvYWQudXNlcklkLFxyXG4gICAgdXNlcm5hbWU6IHBheWxvYWQudXNlcm5hbWUsXHJcbiAgICByb2xlOiBwYXlsb2FkLnJvbGUgYXMgQXV0aFRva2VuUGF5bG9hZFtcInJvbGVcIl0sXHJcbiAgICAuLi4oZG9jdG9ySWQgIT09IHVuZGVmaW5lZCA/IHsgZG9jdG9ySWQgfSA6IHt9KSxcclxuICAgIC4uLihudXJzZURvY3RvcklkICE9PSB1bmRlZmluZWQgPyB7IG51cnNlRG9jdG9ySWQgfSA6IHt9KSxcclxuICB9O1xyXG59O1xyXG4iXX0=