#!/usr/bin/env python
# coding: utf-8

# Update Public Dashboard
import os
import requests

render_deploy_url = os.environ["RENDER_DEPLOY"]
requests.get(render_deploy_url)
