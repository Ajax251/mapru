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

            if (userRegion.includes(allowedRegionKeyword)) {
                return;
            }

            const checkElement = document.getElementById('roscadastresButton') || document.getElementById('schemaIcon');

            if (checkElement) {
                var style = document.createElement('style');
                style.innerHTML = `
                    #roscadastresButton,
                    #addressMapButton,
                    #egrpButton,
                    #schemaIcon {
                        display: none !important;
                    }
                `;
                document.head.appendChild(style);
            } else {
                window.location.href = 'https://ya.ru';
            }
        })
        .catch(error => {
            console.error(error);
        });
})();