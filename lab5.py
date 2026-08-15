import dash
from dash import dcc, html
from dash.dependencies import Input, Output
import plotly.graph_objs as go
import paho.mqtt.client as mqtt
import json
from collections import deque

# Initialize deques (stores the last 20 readings)
temperature_data = deque(maxlen=20)
humidity_data = deque(maxlen=20)
light_data = deque(maxlen=20)
distance_data = deque(maxlen=20)
time_data = deque(maxlen=20)

# MQTT Setup
def on_connect(client, userdata, flags, rc):
    # Replace 12345678 with your actual student ID
    client.subscribe("esp32/21138559/data") 

def on_message(client, userdata, msg):
    global temperature_data, humidity_data, light_data, distance_data, time_data
    payload = json.loads(msg.payload.decode())
    
    temperature_data.append(payload["temperature"])
    humidity_data.append(payload["humidity"])
    light_data.append(payload["light"])
    distance_data.append(payload["distance"])
    time_data.append(len(time_data) + 1)

mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION1)
mqtt_client.on_connect = on_connect
mqtt_client.on_message = on_message
mqtt_client.connect("localhost", 1883, 60)
mqtt_client.loop_start()

# Dash app setup
app = dash.Dash(__name__)
app.title = "Real-Time Sensor Dashboard"

app.layout = html.Div([
    html.H2("ESP32 Real-Time Sensor Dashboard"),
    dcc.Interval(id='interval-component', interval=5000, n_intervals=0),
    dcc.Graph(id='temp-graph'),
    dcc.Graph(id='humidity-graph'),
    dcc.Graph(id='light-graph'),
    dcc.Graph(id='distance-graph')
])

@app.callback(
    [Output('temp-graph', 'figure'),
     Output('humidity-graph', 'figure'),
     Output('light-graph', 'figure'),
     Output('distance-graph', 'figure')],
    [Input('interval-component', 'n_intervals')]
)
def update_graphs(n):
    fig1 = go.Figure(data=[go.Scatter(y=list(temperature_data), x=list(time_data), mode='lines+markers')])
    fig1.update_layout(title='Temperature (°C)', xaxis_title='Time', yaxis_title='°C')
    
    fig2 = go.Figure(data=[go.Scatter(y=list(humidity_data), x=list(time_data), mode='lines+markers')])
    fig2.update_layout(title='Humidity (%)', xaxis_title='Time', yaxis_title='%')
    
    fig3 = go.Figure(data=[go.Scatter(y=list(light_data), x=list(time_data), mode='lines+markers')])
    fig3.update_layout(title='Light Intensity', xaxis_title='Time', yaxis_title='Analog Value')
    
    fig4 = go.Figure(data=[go.Scatter(y=list(distance_data), x=list(time_data), mode='lines+markers')])
    fig4.update_layout(title='Distance (cm)', xaxis_title='Time', yaxis_title='cm')
    
    return fig1, fig2, fig3, fig4

if __name__ == '__main__':
   app.run(debug=True)