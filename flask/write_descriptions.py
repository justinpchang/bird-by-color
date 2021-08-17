import csv
import requests
from bs4 import BeautifulSoup

species = set()

with open('taxonomy.csv', mode = 'r') as file:
	csvFile = csv.reader(file)

	for lines in csvFile:
		if lines[2] != 'SPECIES_CODE':
			species.add(lines[2])

rows = []

for spec in species:
	try:
		print(f"Trying {spec}")
		URL = f"https://ebird.org/species/{spec}"
		page = requests.get(URL)
		soup = BeautifulSoup(page.content, 'html.parser')
		description = soup.find('meta', attrs={'name': 'description'})
		rows.append([spec, description['content']])
	except Exception as e:
		print(e)

with open('descriptions.csv', 'w') as file:
	csvFile = csv.writer(file)
	csvFile.writerows(rows)
