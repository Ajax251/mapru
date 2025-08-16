// sk.js
// Этот файл хранит список систем координат для динамической загрузки в HTML.

const COORDINATE_SYSTEMS = [
    {
        value: "EPSG:4326",
        text: "WGS 84 широта/долгота"
    },
    {
        value: "EPSG:3857",
        text: "Web Mercator - EPSG:3857 - НСПД"
    },
    {
        value: "EPSG:6331601",
        text: "МСК 16-1 Татарстан"
    },
    {
        value: "EPSG:6331602",
        text: "МСК 16-2 Татарстан"
    },
    {
        value: "EPSG:6336302",
        text: "МСК 63-2 Самарская область"
    },
    {
        value: "custom",
        text: "Другая (ввести вручную)"
    }
];