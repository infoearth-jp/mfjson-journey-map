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
// ラインを引くには2点必要
const MIN_LOCATIONS = 2;

function handleFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result).activity_log;

            if (data.geometry?.coordinates?.length >= MIN_LOCATIONS && data.properties?.datetimes?.length >= MIN_LOCATIONS) {
                // 緯度経度と時刻を取得(日本を想定しているので、大きい方が経度lon)
                rawLocations = data.geometry.coordinates.map((coord, i) => ({
                    lat: coord[0] > coord[1] ? coord[1] : coord[0], // 緯度
                    lon: coord[0] > coord[1] ? coord[0] : coord[1], // 経度
                    time: new Date(data.properties.datetimes[i])
                }));
                sliced10Locations = complementMfjsonHandler(data, 1000, 10000);
                sliced30Locations = complementMfjsonHandler(data, 1000, 30000);

                locations = rawLocations;

                // 地図の中心を座標の中間地点に設定
                const midIndex = Math.floor(locations.length / 2);
                const center = locations[midIndex];
                map.setView([center.lat, center.lon], 15);

                startAnimation();
                updateButtons();
            } else {
                alert("無効なJSON形式です");
            }
        } catch (error) {
            alert("JSON解析に失敗しました");
        }
    };
    reader.readAsText(file);
}

// 表示するデータを切り替える(カメラは動かさない)
function switchLocations(target) {
    locations = target;
    startAnimation();
    updateButtons();
}

// 表示中のボタンと、切り替え先の点が足りないボタンを無効化する
// (グリッドに乗る点が1点以下しか無いほど短い軌跡は、切り替えさせない)
function updateButtons() {
    const buttons = [
        { button: slice10Button, locations: sliced10Locations },
        { button: slice30Button, locations: sliced30Locations },
        { button: rawButton, locations: rawLocations },
    ];

    for (const target of buttons) {
        target.button.disabled = target.locations === locations || target.locations.length < MIN_LOCATIONS;
    };
}

function startAnimation() {
    if (intervalId) clearInterval(intervalId);
    index = 0;

    // 軌跡を描画
    if (polyline) map.removeLayer(polyline);
    polyline = L.polyline(locations.map(loc => [loc.lat, loc.lon]), {
        color: "#0E3C96",
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
// prev, nextの区間をsliceMilSec間隔で線形補間する。
// prevを含みnextは含まないので、区間ごとの結果をそのまま連結できる。
// prev: {time, lat, lon}
// next: {time, lat, lon}
// sliceMilSec: スライス間隔(ミリ秒)
function complementDataWithSlice(prev, next, sliceMilSec){
    const totalMilSec = next.time.getTime() - prev.time.getTime();
    // 同時刻・逆順の区間はprevを捨てる(nextが次の区間のprevとして残る)
    if (totalMilSec <= 0) return [];

    // ceilなので、区間がsliceMilSec未満でも最低1点(prev)は残る
    const sliceTimes = Math.ceil(totalMilSec / sliceMilSec);

    const tmp = [];
    for (let i = 0; i < sliceTimes; i++){
        const elapsedMilSec = sliceMilSec * i;
        // スライス数ではなく実際の経過時間の比で按分する
        const ratio = elapsedMilSec / totalMilSec;
        tmp.push({
            time: new Date(prev.time.getTime() + elapsedMilSec),
            lat: prev.lat + (next.lat - prev.lat) * ratio,
            lon: prev.lon + (next.lon - prev.lon) * ratio,
        });
    };

    return tmp;
};

// mfjsonの軌跡をthinMilSec間隔に再サンプリングした[{time, lat, lon}, ...]を返す。
// 1秒間隔で全区間を補間してから、thinMilSecの目盛りに乗る点だけを残す。
// mfjson: {
//     "type":"Feature",
//     ~ ,
//     "geometry":{
//         "type":"LineString",
//         "coordinates":[[lon, lat, alt], ...]
//     },
//     "properties":{
//         "datetimes":["YYYY-MM-DDThh:mm:ss+09:00", ...]
//     },
//   }
// sliceMilSec: 補間間隔(ミリ秒)
// thinMilSec: 間引き後の間隔(ミリ秒)
function complementMfjsonHandler(mfjson, sliceMilSec = 1000, thinMilSec = 10000){
    const datetimes = mfjson.properties.datetimes;
    const coordinates = mfjson.geometry.coordinates;
    const length = Math.min(datetimes.length, coordinates.length);
    if (length === 0) return [];

    const points = [];
    for (let i = 0; i < length; i++){
        const time = new Date(datetimes[i]);
        points.push({
            // (timeを1秒の位で四捨五入する)
            time: new Date(Math.round(time.getTime() / 1000) * 1000),
            lat: coordinates[i][1],
            lon: coordinates[i][0],
        });
    };

    // 1秒間隔で不足分を埋める
    const filled = [];
    for (let i = 0; i < length - 1; i++){
        filled.push(...complementDataWithSlice(points[i], points[i + 1], sliceMilSec));
    };
    // 各区間はnextを含まないので、最終点だけ手で足す
    filled.push(points[length - 1]);

    // thinMilSecの目盛りから外れた点を消す
    return filled.filter(point => point.time.getTime() % thinMilSec === 0);
};