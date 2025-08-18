(async () => {
    const _source = [
      //  'N'
    ];

    function decodeString(encodedStr) {
        try {
            const reversed = atob(encodedStr);
            return reversed.split('').reverse().join('');
        } catch (e) {
            return '';
        }
    }

    try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) return;
        const data = await response.json();
        const userIP = data.ip;

        for (const item of _source) {
            const decodedIP = decodeString(item);
            if (userIP === decodedIP) {
                window.location.href = 'https://yandex.ru';
                return;
            }
        }
    } catch (error) {
        console.error(':', error);
    }
})();