"""
SkyGuard AI — Station Generator
=================================
Generates 20 realistic AWS station metadata entries spread across India,
covering major geographical zones (plains, coast, hills, desert, northeast).
"""

import json
import random
from pathlib import Path

# Seed for reproducibility — same 20 stations every run
random.seed(42)

STATIONS = [
    # (station_id, name, lat, lon, elevation_m, region)
    ("ST001", "Delhi-Safdarjung",    28.5879,  77.2090,  216,  "plains"),
    ("ST002", "Mumbai-Colaba",       18.9067,  72.8147,   11,  "coast"),
    ("ST003", "Chennai-Nungambakkam",13.0827,  80.2707,   16,  "coast"),
    ("ST004", "Kolkata-Alipore",     22.5276,  88.3271,    6,  "coast"),
    ("ST005", "Bengaluru-HAL",       12.9619,  77.5937,  921,  "hills"),
    ("ST006", "Hyderabad-Begumpet",  17.4539,  78.4671,  545,  "plains"),
    ("ST007", "Jaipur-Sanganer",     26.8242,  75.8122,  390,  "desert"),
    ("ST008", "Ahmedabad-Airport",   23.0733,  72.6336,   55,  "plains"),
    ("ST009", "Pune-Shivajinagar",   18.5204,  73.8567,  559,  "hills"),
    ("ST010", "Lucknow-Amausi",      26.7606,  80.8893,  111,  "plains"),
    ("ST011", "Bhopal-Bairagarh",    23.2832,  77.3449,  527,  "plains"),
    ("ST012", "Guwahati-Borjhar",    26.1060,  91.5856,   55,  "northeast"),
    ("ST013", "Srinagar-Airport",    34.0086,  74.8195, 1587,  "hills"),
    ("ST014", "Shimla-Observatory",  31.1048,  77.1734, 2202,  "hills"),
    ("ST015", "Jodhpur-Airport",     26.2511,  73.0489,  224,  "desert"),
    ("ST016", "Visakhapatnam-AWS",   17.7132,  83.2988,   15,  "coast"),
    ("ST017", "Nagpur-Sonegaon",     21.0922,  79.0472,  310,  "plains"),
    ("ST018", "Thiruvananthapuram",   8.4875,  76.9525,   64,  "coast"),
    ("ST019", "Patna-Airport",       25.5913,  85.0956,   60,  "plains"),
    ("ST020", "Shillong-AWS",        25.5788,  91.8933, 1496,  "northeast"),
]


def get_all_stations() -> list[dict]:
    """Return all station metadata as a list of dicts."""
    result = []
    for sid, name, lat, lon, elev, region in STATIONS:
        result.append({
            "station_id":  sid,
            "name":        name,
            "lat":         lat,
            "lon":         lon,
            "elevation_m": elev,
            "region":      region,
        })
    return result


def get_station_by_id(station_id: str) -> dict | None:
    for s in get_all_stations():
        if s["station_id"] == station_id:
            return s
    return None


if __name__ == "__main__":
    stations = get_all_stations()
    out = Path(__file__).parent / "generated"
    out.mkdir(exist_ok=True)
    with open(out / "stations.json", "w") as f:
        json.dump(stations, f, indent=2)
    print(f"Generated {len(stations)} stations → data/generated/stations.json")
