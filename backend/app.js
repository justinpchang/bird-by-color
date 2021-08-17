import axios from 'axios';
import dotenv from 'dotenv';
import express from 'express';
import { Low, JSONFile } from 'lowdb';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Configuration
 */
dotenv.config();
const __dirname = dirname(fileURLToPath(import.meta.url));

const file = join(__dirname, 'db.json');
const adapter = new JSONFile(file);
const db = new Low(adapter);
await db.read();

const app = express();

/**
 * Constants
 */
const MOCK = {
    LATITUDE: '32.216316',
    LONGITUDE: '-80.752609',
};

const MAX_N_SPECIES = 100;

/**
 * Routes
 */
app.get('/', (req, res) => {
    res.send('hello world');
});

app.get('/birds', async (req, res) => {
    // Get params
    const latitude = MOCK.LATITUDE;
    const longitude = MOCK.LONGITUDE;

    // Get region code
    let regionCode = '';

    try {
        const censusURL = `https://geo.fcc.gov/api/census/area?lat=${latitude}&lon=${longitude}&format=json`;
        const response = await axios.get(censusURL);
        const result = response.data.results[0];
        const fips = result['county_fips'];

        regionCode = `US-${result['state_code']}-${fips[2]}${fips[3]}${fips[4]}`;
    } catch (e) {
        res.status(500).send('Could not retrieve region code');
    }

    // Get species list for region
    let speciesList = [];

    try {
        const speciesListURL = `https://api.ebird.org/v2/product/spplist/${regionCode}`;
        const config = {
            headers: {
                'X-eBirdApiToken': process.env.EBIRD_API_TOKEN,
            },
        };
        const response = await axios.get(speciesListURL, config);
        speciesList = response.data.slice(0, MAX_N_SPECIES);
    } catch (e) {
        res.status(500).send(
            'Could not retrieve species list for region ' + regionCode
        );
    }

    // Get most recent DB data
    await db.read();

    // Write info to response
    res.writeHead(200, {
        'Content-Type': 'application/json',
        'Transfer-Encoding': 'chunked',
    });
    res.write('[');

    let separator = '';
    for (let i = 0; i < speciesList.length - 1; i++) {
        const speciesCode = speciesList[i];

        // Check if species info exists in db
        let speciesData = db.data.species[speciesCode];

        // If it doesn't exist, get data
        if (
            !speciesData?.photoUrl || 
            !speciesData.commonName ||
            !speciesData.scientificName
        ) {
            const ebirdURL = `https://ebird.org/media/catalog.json?searchField=species&taxonCode=${speciesCode}`;
            const response = await axios.get(ebirdURL);
            const { previewUrl, commonName, sciName } =
                response.data.results.content[0];
            
            // Add data to db object
            speciesData = {
                photoUrl: previewUrl,
                commonName,
                scientificName: sciName,
            };

            // Write data to db object
            db.data.species[speciesCode] = speciesData;
        }

        res.write(separator + JSON.stringify(speciesCode));
        separator = ',';
    }

    res.write(']');
    res.end();

    // Update db with changes
    db.write();
});

app.listen(5000, () => {
    console.log('Listening on http://localhost:5000');
});
