#!/usr/bin/env python
# coding: utf-8

# HDB Dashboard Creation Workflow
import os
import json
import requests
import pandas as pd
from pymongo import mongo_client
import plotly.graph_objects as go
from datetime import datetime, timedelta
from plotly.subplots import make_subplots


# MongoDB credentials
MONGO_PASSWORD = os.environ["mongo_pw"]
base_url = "mongodb+srv://cliffchew84:"
end_url = "cliff-nlb.t0whddv.mongodb.net/?retryWrites=true&w=majority"
mongo_url = f"{base_url}{MONGO_PASSWORD}@{end_url}"

# Connect to MongoDB to get past housing data
db = mongo_client.MongoClient(mongo_url, serverSelectionTimeoutMS=5000)
db_nlb = db['nlb']
df = pd.DataFrame(list(db_nlb['hdb_hist'].find({}, {"_id": 0})))

# Update months in the latest year - Currently this is 2024 
current_mth = datetime.now().strftime("%Y-%m")
mths_2024 = [str(i)[:7] for i in pd.date_range(
    "2024-01-01", current_mth + "-01", freq='MS').tolist()]

param_fields = ",".join(['month', 'town', 'resale_price'])
y2024 = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc"
base_url = "https://data.gov.sg/api/action/datastore_search?resource_id="
url = base_url + y2024

for mth in mths_2024:
    params = {
        "fields": param_fields,
        "filters": json.dumps({'month': mth}),
        "limit": 10000
    }
    response = requests.get(url, params=params)
    mth_df = pd.DataFrame(response.json().get("result").get("records"))
    df = pd.concat([df, mth_df], axis=0)

# Data Processing for creating charts
df['yr_q'] = [str(i) for i in pd.to_datetime(df['month']).dt.to_period('Q')]
df['count'] = 1
df.rename(columns={'resale_price': 'price'}, inplace=True)
df.price = df.price.astype(float)

# Create price categories
bins = [0, 300000, 500000, 800000, 1000000, 2000000]
labels = ["0-300k", "300-500k", "500-800k", "800k-1m", ">=1m"]
df["price_grp"] = pd.cut(df["price"], bins=bins, labels=labels, right=False)
price_grps = df['price_grp'].unique().tolist()
price_grps.sort()

price_grps_dict = dict()
price_grps_dict[price_grps[0]] = '#8BC1F7'
price_grps_dict[price_grps[1]] = '#06C'
price_grps_dict[price_grps[2]] = '#4CB140'
price_grps_dict[price_grps[3]] = '#F0AB00'
price_grps_dict[price_grps[4]] = '#C9190B'

chart_width, chart_height = 1000, 600
legend = dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1)
q_period, m_period = 'yr_q', 'month'
today = str(datetime.today().date())
note = f'Updated on {today}'


# My Graphs
# Home price distributions
med_prices = [{i.get(q_period): i.get('price')} for i in df.groupby(q_period)[
    'price'].median().reset_index().to_dict(orient='records')]
high_med_prices = [i for i in med_prices if list(i.values())[0] >= 500000]
high_med_prices = [list(i.keys())[0] for i in high_med_prices]

fig = go.Figure()
for p in df[q_period].drop_duplicates():
    if p not in high_med_prices:
        fig.add_trace(go.Box(
            y=df[df[q_period] == p].price,
            name=str(p),
            boxpoints='outliers',
            marker_color='#06C',
            line_color='#06C',
            showlegend=False
        ))
    else:
        fig.add_trace(go.Box(
            y=df[df[q_period] == p].price,
            name=str(p),
            boxpoints='outliers',
            marker_color='#C9190B',
            line_color='#C9190B',
            showlegend=False
        ))

fig.update_layout(
    title=f"Quarters - Public Home Price Distributions<br>{note}",
    yaxis={"title": "Home Prices"},
    xaxis={"title": "Quarters"},
    width=chart_width, height=chart_height,
    legend=legend
)

fig.add_hrect(
    y0="1000000", y1=str(round(df.price.max(), 100)),
    fillcolor="LightSalmon", opacity=0.35, layer="below", line_width=0,
)

with open('profile/assets/charts/qtr_boxplot.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

fig = go.Figure()
med_prices = [{i.get(m_period): i.get('price')} for i in df.groupby(m_period)[
    'price'].median().reset_index().to_dict(orient='records')]
high_med_prices = [i for i in med_prices if list(i.values())[0] >= 500000]
high_med_prices = [list(i.keys())[0] for i in high_med_prices]

mth_df = df[df.yr_q >= '2020Q1']
for p in mth_df[m_period].drop_duplicates():
    if p not in high_med_prices:
        fig.add_trace(go.Box(
            y=df[df[m_period] == p].price,
            name=str(p),
            boxpoints='outliers',
            marker_color='#06C',
            line_color='#06C',
            showlegend=False
        ))
    else:
        fig.add_trace(go.Box(
            y=df[df[m_period] == p].price,
            name=str(p),
            boxpoints='outliers',
            marker_color='#C9190B',
            line_color='#C9190B',
            showlegend=False
        ))

fig.update_layout(
    title=f'Months - Public Home Price Distributions<br>{note}',
    yaxis={"title": "Home Prices"},
    xaxis={"title": "Months"},
    width=chart_width, height=chart_height,
    legend=legend
)

fig.add_hrect(
    y0="1000000", y1=str(round(df.price.max(), 100)),
    fillcolor="LightSalmon", opacity=0.35, layer="below", line_width=0,
)

with open('profile/assets/charts/mth_boxplot.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

# Advanced Million Dollar Homes
df['mil'] = [1 if i >= 1000000 else 0 for i in df['price']]
for_plot = df.groupby([q_period, 'mil'])[
    'town'].count().reset_index().sort_values(q_period)
cal_ = for_plot.pivot_table(index=q_period, values='town',
                            columns='mil', margins=True,
                            aggfunc="sum").reset_index().fillna(0)

for i in [0, 1, 'All']:
    cal_[i] = cal_[i].astype(int)

cal_['proportion'] = [round(i, 2) for i in cal_[1] / cal_['All'] * 100]
cal_mil_ts = cal_[cal_[q_period] != 'All'].reset_index(drop=True)
cal_mil_ts.columns = [q_period, '0', 'million $ Trans',
                      'Total Trans', '% million Trans']

fig = make_subplots(specs=[[{"secondary_y": True}]])

title = f"Quarters - % of Million Dollar Homes & Total Homes Sold<br>{note}"
fig.add_trace(go.Scatter(
    x=cal_mil_ts[q_period],
    y=cal_mil_ts['% million Trans'],
    mode='lines+markers',
    name="%"),
    secondary_y=False)

fig.add_trace(go.Bar(
    x=cal_mil_ts[q_period],
    y=cal_mil_ts['0'],
    opacity=.4,
    name="Total Sales"),
    secondary_y=True)

fig.update_layout(
    title=title,
    hovermode="x unified",
    xaxis={"title": "Quarters"},
    width=chart_width, height=chart_height,
    legend=legend
)

fig.update_yaxes(title_text="Million Dollar Homes / Total Home Sales (%)",
                 secondary_y=False)
fig.update_yaxes(title_text="Total Sales", secondary_y=True)

fig.add_hline(y=1, line_width=1.5, line_dash="dash", line_color="black")
fig.add_hline(y=1.5, line_width=1.5, line_dash="dash", line_color="red")

with open('profile/assets/charts/qtr_barline_chart.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

df['mil'] = [1 if i >= 1000000 else 0 for i in df['price']]
for_plot = df[df.yr_q >= '2020Q1'].groupby(
    [m_period, 'mil'])['town'].count().reset_index().sort_values(m_period)
cal_ = for_plot.pivot_table(index=m_period, values='town',
                            columns='mil', margins=True,
                            aggfunc="sum").reset_index().fillna(0)

for i in [0, 1, 'All']:
    cal_[i] = cal_[i].astype(int)

cal_['proportion'] = [round(i, 2) for i in cal_[1] / cal_['All'] * 100]
cal_mil_ts = cal_[cal_[m_period] != 'All'].reset_index(drop=True)
cal_mil_ts.columns = [m_period, '0', 'million $ Trans',
                      'Total Trans', '% million Trans']

fig = make_subplots(specs=[[{"secondary_y": True}]])

title = f"Months - % of Million Dollar Homes & Total Homes Sold<br>{note}"
fig.add_trace(go.Scatter(
    x=cal_mil_ts[m_period],
    y=cal_mil_ts['% million Trans'],
    mode='lines+markers',
    name="%"),
    secondary_y=False)

fig.add_trace(go.Bar(
    x=cal_mil_ts[m_period],
    y=cal_mil_ts['0'],
    opacity=.4,
    name="Total Sales"),
    secondary_y=True)

fig.update_layout(
    title=title,
    hovermode="x unified",
    xaxis={"title": "Months"},
    width=chart_width, height=chart_height,
    legend=legend
)

fig.update_yaxes(title_text="Million Dollar Homes / Total Home Sales (%)",
                 secondary_y=False)
fig.update_yaxes(title_text="Total Sales", secondary_y=True)

fig.add_hline(y=1, line_width=1.5, line_dash="dash", line_color="black")
fig.add_hline(y=1.5, line_width=1.5, line_dash="dash", line_color="red")
with open('profile/assets/charts/mth_barline_chart.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

# ### Stacked Bar Values
pg_plots = df.groupby([q_period, 'price_grp'])['count'].sum().reset_index()

fig = go.Figure()
for i in pg_plots.price_grp.drop_duplicates().tolist():
    fig.add_trace(
        go.Bar(name=i,
               x=pg_plots[pg_plots.price_grp == i][q_period].tolist(),
               y=pg_plots[pg_plots.price_grp == i]['count'].tolist(),
               marker_color=price_grps_dict[i]
               ))

fig.update_layout(
    barmode='stack',
    xaxis={'title': 'Quarters'},
    yaxis={'title': 'Count'},
    hovermode="x unified",
    title=f"Quarters - Total Public Home Sales by Price Category<br>{note}",
    width=chart_width, height=chart_height,
    legend=legend
)

with open('profile/assets/charts/qtr_stack_bar_values.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

pg_plots = df[df.yr_q >= '2020Q1'].groupby([m_period, 'price_grp'])[
    'count'].sum().reset_index()

fig = go.Figure()
for i in price_grps:
    fig.add_trace(
        go.Bar(name=i,
               x=pg_plots[pg_plots.price_grp == i][m_period].tolist(),
               y=pg_plots[pg_plots.price_grp == i]['count'].tolist(),
               marker_color=price_grps_dict[i]
               ))

fig.update_layout(
    barmode='stack',
    xaxis={'title': 'Months'},
    yaxis={'title': 'Count'},
    hovermode="x unified",
    title=f"Months - Total Public Home Sales by Price Category<br>{note}",
    width=chart_width, height=chart_height,
    legend=legend
)

with open('profile/assets/charts/mth_stack_bar_values.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

# Stacked Bar Percentage
pg_base = df.groupby(q_period)['count'].sum().reset_index()
pg_plots = df.groupby([q_period, 'price_grp'])['count'].sum().reset_index()
for_plot = pg_plots.merge(pg_base, on=q_period)
for_plot.columns = [q_period, 'price_grp', 'count', 'total']
for_plot['percent_count'] = [round(
    i * 100, 1) for i in for_plot['count'] / for_plot['total']]

fig = go.Figure()
for i in price_grps:
    fig.add_trace(
        go.Bar(name=i,
               x=for_plot[for_plot.price_grp == i][q_period].tolist(),
               y=for_plot[for_plot.price_grp == i]['percent_count'].tolist(),
               marker_color=price_grps_dict[i]
               ))

fig.add_hline(y=50, line_width=1.5, line_dash="dash", line_color="purple")
fig.update_layout(
    barmode='stack',
    title=f"Quarters - % of Public Home Sales by Price Category<br>{note}",
    xaxis={'title': 'Quarters'},
    yaxis={'title': '%'},
    hovermode="x unified",
    width=chart_width, height=chart_height,
    legend=legend
)

with open('profile/assets/charts/qtr_stack_bar_percent.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

mth_df = df[df.yr_q >= '2020Q1']
pg_base = mth_df.groupby(m_period)['count'].sum().reset_index()
pg_plots = mth_df.groupby([m_period, 'price_grp'])['count'].sum().reset_index()
for_plot = pg_plots.merge(pg_base, on=m_period)
for_plot.columns = [m_period, 'price_grp', 'count', 'total']
for_plot['percent_count'] = [round(
    i * 100, 1) for i in for_plot['count'] / for_plot['total']]

fig = go.Figure()
for i in price_grps:
    fig.add_trace(
        go.Bar(name=i,
               x=for_plot[for_plot.price_grp == i][m_period].tolist(),
               y=for_plot[for_plot.price_grp == i]['percent_count'].tolist(),
               marker_color=price_grps_dict[i]
               ))

fig.add_hline(y=50, line_width=1.5, line_dash="dash", line_color="purple")
fig.update_layout(
    barmode='stack',
    title=f"Months - % of Public Home Sales by Price Category<br>{note}",
    xaxis={'title': 'Months'},
    yaxis={'title': '%'},
    hovermode="x unified",
    width=chart_width, height=chart_height,
    legend=legend
)

with open('profile/assets/charts/mth_stack_bar_percent.html', 'w') as f:
    f.write(fig.to_html(full_html=False, include_plotlyjs='cdn'))
f.close()

# Update time of code run
f = open("run_data.txt", "w")
f.write(str(datetime.today()))
f.close()
