const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

const B24_WEBHOOK = process.env.B24_WEBHOOK || 'https://crm.seller24.ru/rest/5/0m202a33aiqe1cyn/';

const SOURCE_MAP = {
  'Платформа':     ['SELLER24'],
  'Веб
