import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);


export const formatDateToTimezone = (isoDate: string, timezone: string, format: "date" | "time" = "date") => {
    const date = dayjs(isoDate);
    return date.tz(timezone).format(format === "date" ? "DD-MM-YYYY" : "hh:mm A");
}