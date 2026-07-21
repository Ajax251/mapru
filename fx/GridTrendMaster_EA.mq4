//+------------------------------------------------------------------+
//|                                        GridTrendMaster_EA.mq4    |
//|            Универсальный Сеточный Советник (MT4)                 |
//+------------------------------------------------------------------+
#property copyright "Grid Backtester EA"
#property link      ""
#property version   "1.01"
#property strict

//--- Единицы измерения параметров
enum ENUM_STEP_UNIT
{
   UNIT_PIPS = 0,    // Пункты / Pips (авто-учет 5-го знака, например 20 = 20 pips)
   UNIT_POINTS = 1   // Пипсы / Points (минимальный тиковый шаг цены)
};

//--- Входные параметры: Настройки сетки
input string         s1 = "=== Параметры сетки ==="; // ---
input ENUM_STEP_UNIT InpStepUnit    = UNIT_PIPS; // Единица измерения параметров
input double         InpGridStep    = 20.0;      // Шаг сетки (Grid Step)
input double         InpTrendStep   = 100.0;     // Шаг тренда для ордеров со (*) (Trend Step)
input double         InpTakeProfit  = 100.0;     // Тейк-профит сетки (Take Profit)
input double         InpMinProfit   = 20.0;      // Мин. профит встречного закрытия (Min Profit)

//--- Входные параметры: Торговые настройки
input string         s2 = "=== Торговые настройки ==="; // ---
input double         InpLotSize     = 0.01;      // Объем лота (Lot Size)
input int            InpSlippage    = 3;         // Допустимое проскальзывание (в пунктах)
input int            InpMagicNumber = 777123;    // Магический номер (Magic Number)
input string         InpComment     = "GridEA";  // Префикс комментария

//--- Структура для отслеживания экстремумов уровней сетки
struct LevelTracker
{
   double level;
   double minPrice;
   double maxPrice;
};

LevelTracker trackers[];
double       pipPoint;
double       prevPrice = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Определение размера пункта
   if(InpStepUnit == UNIT_PIPS)
   {
      if(_Digits == 3 || _Digits == 5)
         pipPoint = _Point * 10.0;
      else
         pipPoint = _Point;
   }
   else
   {
      pipPoint = _Point;
   }

   prevPrice = 0;
   ArrayFree(trackers);

   Print("Советник успешно инициализирован. Размер пункта = ", pipPoint);
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   ArrayFree(trackers);
   Comment("");
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(!IsTradeAllowed()) return;

   // Перевод параметров в абсолютные значения цены
   double gridStepVal   = InpGridStep * pipPoint;
   double trendStepVal  = InpTrendStep * pipPoint;
   double takeProfitVal = InpTakeProfit * pipPoint;
   double minProfitVal  = InpMinProfit * pipPoint;

   if(gridStepVal <= 0) return;

   double currentPrice = MarketInfo(_Symbol, MODE_BID);

   // Первичный запуск на первом тике
   if(prevPrice == 0)
   {
      prevPrice = currentPrice;
      UpdateAllTrackers(currentPrice, gridStepVal);
      return;
   }

   // 1. Проверка встречного закрытия ордеров со звездочкой (*)
   CheckCounterClose(minProfitVal);

   // 2. Определение и обработка пройденных уровней сетки
   if(NormalizeDouble(MathAbs(currentPrice - prevPrice), _Digits) > 0)
   {
      if(prevPrice < currentPrice) // Движение ВВЕРХ
      {
         double firstL = MathFloor(prevPrice / gridStepVal) * gridStepVal;
         double lastL  = MathFloor(currentPrice / gridStepVal) * gridStepVal;

         for(double v = firstL; v <= lastL + (gridStepVal * 0.5); v += gridStepVal)
         {
            double levelNorm = NormalizeDouble(v, _Digits);
            if(prevPrice < levelNorm && currentPrice >= levelNorm)
            {
               ProcessLevelCrossing(levelNorm, "UP", gridStepVal, trendStepVal, takeProfitVal);
            }
         }
      }
      else if(prevPrice > currentPrice) // Движение ВНИЗ
      {
         double firstL = MathCeil(prevPrice / gridStepVal) * gridStepVal;
         double lastL  = MathFloor(currentPrice / gridStepVal) * gridStepVal;

         for(double v = firstL; v >= lastL - (gridStepVal * 0.5); v -= gridStepVal)
         {
            double levelNorm = NormalizeDouble(v, _Digits);
            if(prevPrice > levelNorm && currentPrice <= levelNorm)
            {
               ProcessLevelCrossing(levelNorm, "DOWN", gridStepVal, trendStepVal, takeProfitVal);
            }
         }
      }

      // 3. Обновление трекеров цен для уровней
      UpdateAllTrackers(currentPrice, gridStepVal);
      prevPrice = currentPrice;
   }

   // Отображение информационной панели на графике
   DisplayInfo();
}

//+------------------------------------------------------------------+
//| Получение или создание индекса трекера для уровня               |
//+------------------------------------------------------------------+
int GetTrackerIndex(double level)
{
   level = NormalizeDouble(level, _Digits);
   int size = ArraySize(trackers);
   for(int i = 0; i < size; i++)
   {
      if(MathAbs(trackers[i].level - level) < _Point * 0.5)
         return i;
   }
   ArrayResize(trackers, size + 1);
   trackers[size].level = level;
   trackers[size].minPrice = 0;
   trackers[size].maxPrice = 0;
   return size;
}

//+------------------------------------------------------------------+
//| Обновление трекера для конкретного уровня                        |
//+------------------------------------------------------------------+
void UpdateTracker(double level, double currentPrice)
{
   int idx = GetTrackerIndex(level);

   if(currentPrice >= level)
   {
      trackers[idx].minPrice = currentPrice;
   }
   else
   {
      if(trackers[idx].minPrice == 0 || currentPrice < trackers[idx].minPrice)
         trackers[idx].minPrice = currentPrice;
   }

   if(currentPrice <= level)
   {
      trackers[idx].maxPrice = currentPrice;
   }
   else
   {
      if(trackers[idx].maxPrice == 0 || currentPrice > trackers[idx].maxPrice)
         trackers[idx].maxPrice = currentPrice;
   }
}

//+------------------------------------------------------------------+
//| Обновление всех трекеров в окрестности текущей цены             |
//+------------------------------------------------------------------+
void UpdateAllTrackers(double currentPrice, double gridStepVal)
{
   double minL = currentPrice - 50.0 * gridStepVal;
   double maxL = currentPrice + 50.0 * gridStepVal;

   double startLevel = MathFloor(minL / gridStepVal) * gridStepVal;
   double endLevel   = MathCeil(maxL / gridStepVal) * gridStepVal;

   for(double v = startLevel; v <= endLevel + (gridStepVal * 0.5); v += gridStepVal)
   {
      double levelNorm = NormalizeDouble(v, _Digits);
      UpdateTracker(levelNorm, currentPrice);
   }
}

//+------------------------------------------------------------------+
//| Проверка наличия открытого ордера с конкретным комментарием     |
//+------------------------------------------------------------------+
bool IsOrderOpen(string targetComment, int type)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == _Symbol && OrderMagicNumber() == InpMagicNumber)
         {
            if(OrderType() == type)
            {
               if(StringFind(OrderComment(), targetComment) >= 0)
                  return true;
            }
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Обработка пересечения уровня сетки                               |
//+------------------------------------------------------------------+
void ProcessLevelCrossing(double level, string direction, double gridStepVal, double trendStepVal, double takeProfitVal)
{
   int steps = (int)MathRound(takeProfitVal / gridStepVal);
   string stepsText = IntegerToString(steps);

   if(direction == "UP")
   {
      // А. Обычная BUY сетка
      string gridComment = DoubleToString(level, _Digits) + "/" + stepsText + " BUY";
      if(!IsOrderOpen(gridComment, OP_BUY))
      {
         double ask = MarketInfo(_Symbol, MODE_ASK);
         double tp  = NormalizeDouble(ask + takeProfitVal, _Digits);
         int ticket = OrderSend(_Symbol, OP_BUY, InpLotSize, ask, InpSlippage, 0, tp, gridComment, InpMagicNumber, 0, clrBlue);
         if(ticket < 0)
            Print("Ошибка открытия Grid BUY [", gridComment, "]: ", GetLastError());
      }

      // Б. Трендовый BUY ордер со звездочкой (*)
      string trendComment = DoubleToString(level, _Digits) + "* BUY";
      int trackerIdx = GetTrackerIndex(level);
      double minP = trackers[trackerIdx].minPrice;

      if(minP > 0 && minP <= level - trendStepVal)
      {
         if(!IsOrderOpen(trendComment, OP_BUY))
         {
            double ask = MarketInfo(_Symbol, MODE_ASK);
            int ticket = OrderSend(_Symbol, OP_BUY, InpLotSize, ask, InpSlippage, 0, 0, trendComment, InpMagicNumber, 0, clrGreen);
            if(ticket < 0)
               Print("Ошибка открытия Trend BUY [", trendComment, "]: ", GetLastError());
         }
      }
   }
   else if(direction == "DOWN")
   {
      // А. Обычная SELL сетка
      string gridComment = DoubleToString(level, _Digits) + "/" + stepsText + " SELL";
      if(!IsOrderOpen(gridComment, OP_SELL))
      {
         double bid = MarketInfo(_Symbol, MODE_BID);
         double tp  = NormalizeDouble(bid - takeProfitVal, _Digits);
         int ticket = OrderSend(_Symbol, OP_SELL, InpLotSize, bid, InpSlippage, 0, tp, gridComment, InpMagicNumber, 0, clrRed);
         if(ticket < 0)
            Print("Ошибка открытия Grid SELL [", gridComment, "]: ", GetLastError());
      }

      // Б. Трендовый SELL ордер со звездочкой (*)
      string trendComment = DoubleToString(level, _Digits) + "* SELL";
      int trackerIdx = GetTrackerIndex(level);
      double maxP = trackers[trackerIdx].maxPrice;

      if(maxP > 0 && maxP >= level + trendStepVal)
      {
         if(!IsOrderOpen(trendComment, OP_SELL))
         {
            double bid = MarketInfo(_Symbol, MODE_BID);
            int ticket = OrderSend(_Symbol, OP_SELL, InpLotSize, bid, InpSlippage, 0, 0, trendComment, InpMagicNumber, 0, clrOrange);
            if(ticket < 0)
               Print("Ошибка открытия Trend SELL [", trendComment, "]: ", GetLastError());
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Встречное закрытие ордеров со звездочкой (*)                     |
//+------------------------------------------------------------------+
void CheckCounterClose(double minProfitVal)
{
   bool foundMatch = true;

   while(foundMatch)
   {
      foundMatch = false;
      int total = OrdersTotal();

      for(int i = 0; i < total; i++)
      {
         if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
         if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagicNumber) continue;

         string c1 = OrderComment();
         if(StringFind(c1, "*") < 0) continue; // Требуется наличие ордера со звездочкой

         int ticket1       = OrderTicket();
         int type1         = OrderType();
         double openPrice1 = OrderOpenPrice();

         for(int j = 0; j < total; j++)
         {
            if(i == j) continue;
            if(!OrderSelect(j, SELECT_BY_POS, MODE_TRADES)) continue;
            if(OrderSymbol() != _Symbol || OrderMagicNumber() != InpMagicNumber) continue;

            int type2 = OrderType();
            if(type1 == type2) continue; // Ордера должны быть разнонаправленными (BUY + SELL)

            int ticket2       = OrderTicket();
            double openPrice2 = OrderOpenPrice();

            double buyOpenPrice  = (type1 == OP_BUY) ? openPrice1 : openPrice2;
            double sellOpenPrice = (type1 == OP_SELL) ? openPrice1 : openPrice2;

            double ask = MarketInfo(_Symbol, MODE_ASK);
            double bid = MarketInfo(_Symbol, MODE_BID);

            double buyProfit  = bid - buyOpenPrice;
            double sellProfit = sellOpenPrice - ask;

            if(buyProfit >= minProfitVal && sellProfit >= minProfitVal)
            {
               PrintFormat("Встречное закрытие: Ордер #%d и Ордер #%d. BUY Профит: %.5f, SELL Профит: %.5f",
                           ticket1, ticket2, buyProfit, sellProfit);

               CloseOrder(ticket1);
               CloseOrder(ticket2);

               foundMatch = true;
               break;
            }
         }
         if(foundMatch) break;
      }
   }
}

//+------------------------------------------------------------------+
//| Закрытие ордера по тикету                                        |
//+------------------------------------------------------------------+
bool CloseOrder(int ticket)
{
   if(OrderSelect(ticket, SELECT_BY_TICKET, MODE_TRADES))
   {
      double closePrice = (OrderType() == OP_BUY) ? MarketInfo(_Symbol, MODE_BID) : MarketInfo(_Symbol, MODE_ASK);
      return OrderClose(ticket, OrderLots(), closePrice, InpSlippage, clrYellow);
   }
   return false;
}

//+------------------------------------------------------------------+
//| Вывод информации на график                                       |
//+------------------------------------------------------------------+
void DisplayInfo()
{
   int totalOrders = 0;
   double totalProfit = 0;

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(OrderSelect(i, SELECT_BY_POS, MODE_TRADES))
      {
         if(OrderSymbol() == _Symbol && OrderMagicNumber() == InpMagicNumber)
         {
            totalOrders++;
            totalProfit += OrderProfit() + OrderSwap() + OrderCommission();
         }
      }
   }

   string text = "=====================================\n";
   text += "   УНИВЕРСАЛЬНЫЙ СЕТОЧНЫЙ СОВЕТНИК   \n";
   text += "=====================================\n";
   text += StringFormat("Символ: %s | Лотаж: %.2f\n", _Symbol, InpLotSize);
   text += StringFormat("Единица: %s\n", EnumToString(InpStepUnit));
   text += StringFormat("Шаг сетки: %.1f | Шаг тренда: %.1f\n", InpGridStep, InpTrendStep);
   text += StringFormat("TakeProfit: %.1f | MinProfit: %.1f\n", InpTakeProfit, InpMinProfit);
   text += "-------------------------------------\n";
   text += StringFormat("Открытых ордеров: %d\n", totalOrders);
   text += StringFormat("Плавающая прибыль: %.2f %s\n", totalProfit, AccountCurrency());
   text += "=====================================";

   Comment(text);
}