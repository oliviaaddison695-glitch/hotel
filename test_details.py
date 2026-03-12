import requests
import json

api_key = "AIzaSyCPYoWbh0n0jPYkIQmN5NuEn0CFMtoeYMs"
# Let's find a place id for a hotel first
url = f"https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=hilton%20new%20york&inputtype=textquery&fields=place_id&key={api_key}"
try:
    res = requests.get(url).json()
    print("Find Place:", res)
    if res.get('candidates'):
        place_id = res['candidates'][0]['place_id']
        details_url = f"https://maps.googleapis.com/maps/api/place/details/json?place_id={place_id}&key={api_key}"
        res2 = requests.get(details_url).json()
        print("Details keys:", res2.get('result', {}).keys())
except Exception as e:
    print(e)
