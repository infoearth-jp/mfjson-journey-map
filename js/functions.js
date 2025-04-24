// MF-JSON type
// {~,"activity_log":{
//     "type":"Feature",
//     ~ ,
//     "geometry":{
//         "type":"LineString",
//         "coordinates":[[lon, lat, alt], ...]
//     },
//     "properties":{
//         "datetimes":["YYYY-MM-DDThh:mm:ss+09:00", ...]
//     },
//   }}

// 画面描画 ==================================================
function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result).activity_log;

            if (data.geometry?.coordinates?.length > 0 && data.properties?.datetimes?.length > 0) {
                // 緯度経度と時刻を取得(日本を想定しているので、大きい方が経度lon)
                locations = data.geometry.coordinates.map((coord, i) => ({
                    lat: coord[0] > coord[1] ? coord[1] : coord[0], // 緯度
                    lon: coord[0] > coord[1] ? coord[0] : coord[1], // 経度
                    time: new Date(data.properties.datetimes[i])
                }));

                // 地図の中心を座標の中間地点に設定
                const midIndex = Math.floor(locations.length / 2);
                const center = locations[midIndex];
                map.setView([center.lat, center.lon], 15);

                startAnimation();
            } else {
                alert("無効なJSON形式です");
            }
        } catch (error) {
            alert("JSON解析に失敗しました");
        }
    };
    reader.readAsText(file);
}

function startAnimation() {
    if (intervalId) clearInterval(intervalId);
    index = 0;

    // 軌跡を描画
    if (polyline) map.removeLayer(polyline);
    polyline = L.polyline(locations.map(loc => [loc.lat, loc.lon]), {
        color: "#66ccff",
        weight: 3,
        // dashArray: "10, 10"
    }).addTo(map);

    // マーカー作成
    if (marker) map.removeLayer(marker);
    marker = L.circleMarker([locations[0].lat, locations[0].lon], {
        color: "#ff66b2",
        radius: 10,
        fillOpacity: 0.9
    }).addTo(map);

    // アニメーション開始
    intervalId = setInterval(() => {
        if (index >= locations.length) index = 0;

        let { lat, lon, time } = locations[index];
        marker.setLatLng([lat, lon]);
        
        // 座標と時刻表示
        const timeString = time.toTimeString().split(' ')[0]; // HH:MM:SS形式
        timeLabel.textContent = `時刻: ${timeString}`;

        index++;
    }, 1000);
};

// ユーティリティ ==================================================
function complementDataWithSlice(prev, next, sliceMilSec){
    const sliceTimes = Math.floor((next.time - prev.time) / sliceMilSec);
    const sliceLat = (next.lat - prev.lat) / sliceTimes;
    const sliceLon = (next.lon - prev.lon) / sliceTimes;

    const tmp = [];
    for (let i = 0; i < sliceTimes; i++){
        tmp.push({
            time: new Date(prev.time.getTime() + sliceMilSec * i),
            lat: prev.lat + sliceLat * i,
            lon: prev.lon + sliceLon * i,
        });
    };
};
