"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestId = exports.requestLogger = void 0;
const morgan_1 = __importDefault(require("morgan"));
const env_1 = require("../config/env");
/** Dev: цветной; production: компактная строка без лишнего шума. */
exports.requestLogger = (0, morgan_1.default)(env_1.env.isProduction ? "tiny" : "dev");
const requestId = (_req, _res, next) => {
    next();
};
exports.requestId = requestId;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQzovVXNlcnMvdXNlci9EZXNrdG9wL2NybSB2MS44L3NlcnZpY2VzL2FwaS9zcmMvbWlkZGxld2FyZS9yZXF1ZXN0TG9nZ2VyLnRzIiwic291cmNlcyI6WyJDOi9Vc2Vycy91c2VyL0Rlc2t0b3AvY3JtIHYxLjgvc2VydmljZXMvYXBpL3NyYy9taWRkbGV3YXJlL3JlcXVlc3RMb2dnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0Esb0RBQTRCO0FBQzVCLHVDQUFvQztBQUVwQyxvRUFBb0U7QUFDdkQsUUFBQSxhQUFhLEdBQUcsSUFBQSxnQkFBTSxFQUFDLFNBQUcsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUM7QUFFaEUsTUFBTSxTQUFTLEdBQUcsQ0FBQyxJQUFhLEVBQUUsSUFBYyxFQUFFLElBQWtCLEVBQUUsRUFBRTtJQUM3RSxJQUFJLEVBQUUsQ0FBQztBQUNULENBQUMsQ0FBQztBQUZXLFFBQUEsU0FBUyxhQUVwQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgUmVxdWVzdCwgUmVzcG9uc2UsIE5leHRGdW5jdGlvbiB9IGZyb20gXCJleHByZXNzXCI7XHJcbmltcG9ydCBtb3JnYW4gZnJvbSBcIm1vcmdhblwiO1xyXG5pbXBvcnQgeyBlbnYgfSBmcm9tIFwiLi4vY29uZmlnL2VudlwiO1xyXG5cclxuLyoqIERldjog0YbQstC10YLQvdC+0Lk7IHByb2R1Y3Rpb246INC60L7QvNC/0LDQutGC0L3QsNGPINGB0YLRgNC+0LrQsCDQsdC10Lcg0LvQuNGI0L3QtdCz0L4g0YjRg9C80LAuICovXHJcbmV4cG9ydCBjb25zdCByZXF1ZXN0TG9nZ2VyID0gbW9yZ2FuKGVudi5pc1Byb2R1Y3Rpb24gPyBcInRpbnlcIiA6IFwiZGV2XCIpO1xyXG5cclxuZXhwb3J0IGNvbnN0IHJlcXVlc3RJZCA9IChfcmVxOiBSZXF1ZXN0LCBfcmVzOiBSZXNwb25zZSwgbmV4dDogTmV4dEZ1bmN0aW9uKSA9PiB7XHJcbiAgbmV4dCgpO1xyXG59O1xyXG4iXX0=