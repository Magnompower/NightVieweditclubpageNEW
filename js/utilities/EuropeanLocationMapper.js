class EuropeanLocationMapper {
    constructor() {
        this.countryBoundingBoxes = {
            "AL": { name: "Albania", bbox: [19.16, 39.64, 21.03, 42.67] },
            "AD": { name: "Andorra", bbox: [1.47, 42.46, 1.71, 42.64] },
            "AM": { name: "Armenia", bbox: [43.58, 38.74, 46.51, 41.25] },
            "AT": { name: "Austria", bbox: [9.55, 46.37, 17.15, 49.02] },
            "BY": { name: "Belarus", bbox: [23.18, 51.29, 32.77, 56.17] },
            "BE": { name: "Belgium", bbox: [2.47, 49.49, 6.37, 51.51] },
            "BA": { name: "Bosnia", bbox: [15.75, 42.56, 19.62, 45.26] },
            "BG": { name: "Bulgaria", bbox: [22.36, 41.25, 28.61, 44.23] },
            "HR": { name: "Croatia", bbox: [13.19, 42.37, 19.44, 46.51] },
            "CY": { name: "Cyprus", bbox: [32.27, 34.58, 34.59, 35.72] },
            "CZ": { name: "Czech Republic", bbox: [12.09, 48.55, 18.86, 51.05] },
            "DK": { name: "Denmark", bbox: [8.06, 54.53, 15.17, 57.75] },
            "EE": { name: "Estonia", bbox: [21.76, 57.49, 28.22, 59.54] },
            "FI": { name: "Finland", bbox: [19.09, 59.79, 31.58, 70.10] },
            "FR": { name: "France", bbox: [-5.11, 42.34, 9.54, 51.09] },
            "GE": { name: "Georgia", bbox: [39.75, 41.04, 46.67, 43.55] },
            "DE": { name: "Germany", bbox: [5.86, 47.27, 15.04, 54.83] },
            "GR": { name: "Greece", bbox: [19.38, 34.81, 28.23, 41.75] },
            "HU": { name: "Hungary", bbox: [16.21, 45.75, 22.56, 48.59] },
            "IS": { name: "Iceland", bbox: [-24.54, 63.39, -13.04, 66.54] },
            "IE": { name: "Ireland", bbox: [-10.48, 51.44, -6.03, 55.34] },
            "IT": { name: "Italy", bbox: [6.62, 36.63, 18.52, 47.09] },
            "XK": { name: "Kosovo", bbox: [20.09, 41.99, 21.69, 43.09] },
            "LV": { name: "Latvia", bbox: [20.99, 55.68, 28.22, 57.99] },
            "LI": { name: "Liechtenstein", bbox: [9.48, 47.02, 9.62, 47.21] },
            "LT": { name: "Lithuania", bbox: [20.99, 53.89, 26.59, 56.44] },
            "LU": { name: "Luxembourg", bbox: [5.73, 49.42, 6.55, 50.19] },
            "MT": { name: "Malta", bbox: [14.25, 35.83, 14.59, 36.08] },
            "MD": { name: "Moldova", bbox: [26.61, 45.41, 30.17, 48.48] },
            "MC": { name: "Monaco", bbox: [7.41, 43.73, 7.42, 43.74] },
            "ME": { name: "Montenegro", bbox: [18.41, 41.83, 20.27, 43.52] },
            "NL": { name: "Netherlands", bbox: [3.22, 50.75, 7.22, 53.55] },
            "MK": { name: "North Macedonia", bbox: [20.45, 40.85, 23.00, 42.33] },
            "NO": { name: "Norway", bbox: [4.09, 57.99, 31.33, 71.19] },
            "PL": { name: "Poland", bbox: [14.12, 49.00, 24.15, 54.83] },
            "PT": { name: "Portugal", bbox: [-9.55, 36.95, -6.19, 42.16] },
            "RO": { name: "Romania", bbox: [20.25, 43.62, 29.68, 48.27] },
            "RU": { name: "Russia", bbox: [19.66, 41.15, 180.00, 81.34] },
            "SM": { name: "San Marino", bbox: [12.44, 43.93, 12.46, 43.96] },
            "RS": { name: "Serbia", bbox: [18.79, 42.22, 22.96, 46.18] },
            "SK": { name: "Slovakia", bbox: [16.84, 47.72, 22.57, 49.59] },
            "SI": { name: "Slovenia", bbox: [13.38, 45.43, 16.59, 46.88] },
            "ES": { name: "Spain", bbox: [-9.29, 35.86, 4.31, 43.75] },
            "SE": { name: "Sweden", bbox: [11.00, 55.34, 23.99, 69.04] },
            "CH": { name: "Switzerland", bbox: [5.96, 45.82, 10.49, 47.81] },
            "TR": { name: "Turkey", bbox: [25.99, 35.82, 44.82, 42.32] },
            "UA": { name: "Ukraine", bbox: [22.15, 44.21, 40.03, 52.25] },
            "GB": { name: "United Kingdom", bbox: [-8.61, 49.87, 1.76, 58.64] }
        };

        this.cityBoundingBoxes = {
            "København": { name: "København", country: "DK", center: [55.6761, 12.5683], bbox: [12.3683, 55.4761, 12.7683, 55.8761] },
            "Aarhus": { name: "Aarhus", country: "DK", center: [56.1567, 10.2107], bbox: [10.0107, 55.9567, 10.4107, 56.3567] },
            "Stockholm": { name: "Stockholm", country: "SE", center: [59.3293, 18.0686], bbox: [17.8686, 59.1293, 18.2686, 59.5293] },
            "Berlin": { name: "Berlin", country: "DE", center: [52.5200, 13.4050], bbox: [13.2050, 52.3200, 13.6050, 52.7200] },
            "Paris": { name: "Paris", country: "FR", center: [48.8534, 2.3488], bbox: [2.1488, 48.6534, 2.5488, 49.0534] },
            "London": { name: "London", country: "GB", center: [51.5283, -0.0833], bbox: [-0.2833, 51.3283, 0.1167, 51.7283] },
            "Madrid": { name: "Madrid", country: "ES", center: [40.4168, -3.7038], bbox: [-3.9038, 40.2168, -3.5038, 40.6168] },
            "Rome": { name: "Rome", country: "IT", center: [41.9028, 12.4964], bbox: [12.2964, 41.7028, 12.6964, 42.1028] },
            "Amsterdam": { name: "Amsterdam", country: "NL", center: [52.3676, 4.9041], bbox: [4.7041, 52.1676, 5.1041, 52.5676] },
            "Oslo": { name: "Oslo", country: "NO", center: [59.9139, 10.7522], bbox: [10.5522, 59.7139, 10.9522, 60.1139] },
            "Helsinki": { name: "Helsinki", country: "FI", center: [60.1699, 24.9384], bbox: [24.7384, 59.9699, 25.1384, 60.3699] },
            "Vienna": { name: "Vienna", country: "AT", center: [48.2082, 16.3738], bbox: [16.1738, 48.0082, 16.5738, 48.4082] },
            "Dublin": { name: "Dublin", country: "IE", center: [53.3498, -6.2603], bbox: [-6.4603, 53.1498, -6.0603, 53.5498] },
            "Warsaw": { name: "Warsaw", country: "PL", center: [52.2297, 21.0122], bbox: [20.8122, 52.0297, 21.2122, 52.4297] },
            "Athens": { name: "Athens", country: "GR", center: [37.9838, 23.7275], bbox: [23.5275, 37.7838, 23.9275, 38.1838] },
            "Barcelona": { name: "Barcelona", country: "ES", center: [41.3851, 2.1734], bbox: [1.9734, 41.1851, 2.3734, 41.5851] },
            "Bucharest": { name: "Bucharest", country: "RO", center: [44.4268, 26.1025], bbox: [25.9025, 44.2268, 26.3025, 44.6268] },
            "Budapest": { name: "Budapest", country: "HU", center: [47.4979, 19.0402], bbox: [18.8402, 47.2979, 19.2402, 47.6979] },
            "Edinburgh": { name: "Edinburgh", country: "GB", center: [55.9533, -3.1883], bbox: [-3.3883, 55.7533, -2.9883, 56.1533] },
            "Frankfurt": { name: "Frankfurt", country: "DE", center: [50.1109, 8.6821], bbox: [8.4821, 49.9109, 8.8821, 50.3109] },
            "Glasgow": { name: "Glasgow", country: "GB", center: [55.8658, -4.2515], bbox: [-4.4515, 55.6658, -4.0515, 56.0658] },
            "Hamburg": { name: "Hamburg", country: "DE", center: [53.5511, 9.9937], bbox: [9.7937, 53.3511, 10.1937, 53.7511] },
            "Lisbon": { name: "Lisbon", country: "PT", center: [38.7223, -9.1393], bbox: [-9.3393, 38.5223, -8.9393, 38.9223] },
            "Liverpool": { name: "Liverpool", country: "GB", center: [53.4084, -2.9916], bbox: [-3.1916, 53.2084, -2.7916, 53.6084] },
            "Manchester": { name: "Manchester", country: "GB", center: [53.4808, -2.2426], bbox: [-2.4426, 53.2808, -2.0426, 53.6808] },
            "Milan": { name: "Milan", country: "IT", center: [45.4642, 9.1895], bbox: [8.9895, 45.2642, 9.3895, 45.6642] },
            "Munich": { name: "Munich", country: "DE", center: [48.1372, 11.5755], bbox: [11.3755, 47.9372, 11.7755, 48.3372] },
            "Naples": { name: "Naples", country: "IT", center: [40.8526, 14.2681], bbox: [14.0681, 40.6526, 14.4681, 41.0526] },
            "Prague": { name: "Prague", country: "CZ", center: [50.0755, 14.4378], bbox: [14.2378, 49.8755, 14.6378, 50.2755] },
            "Sofia": { name: "Sofia", country: "BG", center: [42.6977, 23.3219], bbox: [23.1219, 42.4977, 23.5219, 42.8977] },
            "Zürich": { name: "Zürich", country: "CH", center: [47.3769, 8.5417], bbox: [8.3417, 47.1769, 8.7417, 47.5769] },
            "Belfast": { name: "Belfast", country: "GB", center: [54.5973, -5.9301], bbox: [-6.1301, 54.3973, -5.7301, 54.7973] },
            "Birmingham": { name: "Birmingham", country: "GB", center: [52.4862, -1.8904], bbox: [-2.0904, 52.2862, -1.6904, 52.6862] },
            "Bordeaux": { name: "Bordeaux", country: "FR", center: [44.8378, -0.5792], bbox: [-0.7792, 44.6378, -0.3792, 45.0378] },
            "Bremen": { name: "Bremen", country: "DE", center: [53.0793, 8.8017], bbox: [8.6017, 52.8793, 9.0017, 53.2793] },
            "Bristol": { name: "Bristol", country: "GB", center: [51.4545, -2.5879], bbox: [-2.7879, 51.2545, -2.3879, 51.6545] },
            "Brussels": { name: "Brussels", country: "BE", center: [50.8503, 4.3517], bbox: [4.1517, 50.6503, 4.5517, 51.0503] },
            "Reykjavík": { name: "Reykjavík", country: "IS", center: [64.1466, -21.9426], bbox: [-22.1426, 63.9466, -21.7426, 64.3466] },
            "Belgrade": { name: "Belgrade", country: "RS", center: [44.7866, 20.4489], bbox: [20.2489, 44.5866, 20.6489, 44.9866] },
            "Marseille": { name: "Marseille", country: "FR", center: [43.2965, 5.3698], bbox: [5.1698, 43.0965, 5.5698, 43.4965] },
            "Lyon": { name: "Lyon", country: "FR", center: [45.7640, 4.8357], bbox: [4.6357, 45.5640, 5.0357, 45.9640] }
        };
    }

    getLocationData(lat, lon) {
        for (const cityName in this.cityBoundingBoxes) {
            const city = this.cityBoundingBoxes[cityName];
            const [minLon, minLat, maxLon, maxLat] = city.bbox;
            if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                return { city: city.name, country: this.countryBoundingBoxes[city.country].name };
            }
        }
        for (const countryCode in this.countryBoundingBoxes) {
            const country = this.countryBoundingBoxes[countryCode];
            const [minLon, minLat, maxLon, maxLat] = country.bbox;
            if (lon >= minLon && lon <= maxLon && lat >= minLat && lat <= maxLat) {
                return { city: "Unknown", country: country.name };
            }
        }
        return { city: "Unknown", country: "Unknown" };
    }
}

export const locationMapper = new EuropeanLocationMapper();
export const getLocationData = (lat, lon) => locationMapper.getLocationData(lat, lon);