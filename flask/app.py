"""
from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
	return "Hello, world"

@app.route("/hi/<username>")
def greet(username):
	return f"Hello, {username}"
"""

import requests
from bs4 import BeautifulSoup

URL = "https://ebird.org/species/amegfi"
page = requests.get(URL)

soup = BeautifulSoup(page.content, "html.parser")
description = soup.find("meta", attrs={"name": "description"})

print(description["content"])

"""
import spacy

nlp = spacy.load("en_core_web_sm")
doc = nlp("Adult males in spring and summer are bright yellow with black forehead and wings.")

for token in doc:
    print(token.text, token.lemma_, token.pos_, token.tag_, token.dep_)
"""

"""
Adult adult NOUN NN amod Xxxxx True False
males male NOUN NNS nsubj xxxx True False ----------------
in in ADP IN prep xx True True
spring spring NOUN NN pobj xxxx True False
and and CCONJ CC cc xxx True True
summer summer NOUN NN conj xxxx True False
are be AUX VBP ROOT xxx True True ------------------------
bright bright ADJ JJ advmod xxxx True False
yellow yellow ADJ JJ acomp xxxx True False ---------------
with with ADP IN prep xxxx True True
black black ADJ JJ amod xxxx True False
forehead forehead NOUN NN pobj xxxx True False
and and CCONJ CC cc xxx True True
wings wing NOUN NNS conj xxxx True False
. . PUNCT . punct . False False
"""

