(function() {
    const token = '68161af8281afe';
    const allowedRegionKeyword = 'Tatarstan';
    const allowedPrefixes = ['178.205.', '127.0.0.1'];

    fetch(`https://ipinfo.io/json?token=${token}`)
        .then(response => {
            if (!response.ok) throw new Error('IP Service Error');
            return response.json();
        })
        .then(data => {
            const userIp = data.ip || '';
            const userRegion = data.region || '';

            const isIpAllowed = allowedPrefixes.some(prefix => userIp.startsWith(prefix));
            if (isIpAllowed) return;

            if (!userRegion.includes(allowedRegionKeyword)) {
                document.documentElement.innerHTML = '';
                document.body.style.backgroundColor = '#1a1a1a';

                const msg = document.createElement('div');
                Object.assign(msg.style, {
                    color: 'white',
                    fontFamily: 'Arial, sans-serif',
                    textAlign: 'center',
                    marginTop: '20%'
                });
              
                document.body.appendChild(msg);

                setTimeout(() => {
                    window.location.href = 'https://google.com';
                }, 10);
            }
        })
        .catch(error => {
            console.error(error);
        });
})();