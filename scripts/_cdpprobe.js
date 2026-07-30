new Promise((resolve) => {
  const svc = new google.maps.DirectionsService();
  svc.route(
    {
      origin: { lat: 35.6812, lng: 139.7671 },
      destination: { lat: 35.4437, lng: 139.638 },
      travelMode: google.maps.TravelMode.DRIVING,
    },
    (res, status) => {
      let km = null;
      try {
        km = res.routes[0].legs[0].distance.value / 1000;
      } catch {}
      resolve({
        where: 'device',
        status: String(status),
        km,
        at: new Date().toISOString(),
      });
    },
  );
});
